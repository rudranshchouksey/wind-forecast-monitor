# Elexon BMRS data notes

Findings from calling the live Insights API and reading its OpenAPI spec
(`https://data.elexon.co.uk/swagger/v1/swagger.json`) on 2026-10-26. Everything
below was observed, not assumed. Probe scripts are reproduced in the appendix.

## Endpoints

Base URL: `https://data.elexon.co.uk/bmrs/api/v1/datasets/`. No API key, no auth.

| Dataset | Endpoint | Query parameters (from spec) |
|---|---|---|
| Actuals | `GET FUELHH/stream` | `publishDateTimeFrom`, `publishDateTimeTo` (date-time), `settlementDateFrom`, `settlementDateTo` (`yyyy-MM-dd`), `settlementPeriod[]`, `fuelType[]` |
| Forecasts | `GET WINDFOR/stream` | `publishDateTimeFrom`, `publishDateTimeTo` (date-time) only |

* The spec states that settlement-date filters cannot be combined with publish-date filters on FUELHH.
* WINDFOR **without** filters returns only the latest publish (73 rows). History requires the publish-time filters.
* `/stream` returns a bare JSON array, without the `{data, metadata}` envelope that the non-stream endpoints use.
* Bad input returns RFC 9110 problem JSON with HTTP 400, e.g.
  `{"title":"One or more validation errors occurred.","status":400,"errors":{"PublishDateTimeFrom":["DateTime should be in ISO format"]}}`.
* Responses send `Cache-Control: no-store`. No rate-limit headers were observed.
* **Limits:** a 4-month WINDFOR range (8 MB, about 90k rows) and a 4-month FUELHH range both returned
  HTTP 200 in about 2 s. No range cap was hit. We still fetch in 7-day chunks so that each
  request is small and a failed chunk can be retried on its own.

## Response shapes

```json
// FUELHH/stream?fuelType=WIND
{"dataset":"FUELHH","publishTime":"2026-02-02T00:00:00Z","startTime":"2026-02-01T23:30:00Z",
 "settlementDate":"2026-02-01","settlementPeriod":48,"fuelType":"WIND","generation":5302}

// WINDFOR/stream
{"dataset":"WINDFOR","publishTime":"2026-01-01T22:30:00Z","startTime":"2025-12-31T21:00:00Z","generation":19498}
```

All timestamps are UTC with a `Z` suffix. `generation` is an integer in MW.

## Observed structure (publishes 2025-12-28 to 2026-02-01, actuals for January 2026)

### WINDFOR (forecasts)
* **8 publishes per day**, at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. That gave 288 publishes over 36 days with no gaps longer than 5 h.
* **Hourly** resolution. Each publish has exactly **73 points**, from 21:00 UTC on the day *before* the publish date to 72 h later.
  * The first points are therefore in the *past* relative to publishTime (horizon down to −25.5 h).
    These are not genuine forecasts and must never be treated as such.
  * The maximum horizon is about 66.5 h (02:30 publish) and the minimum maximum is about 46.5 h (22:30 publish).
    **Horizons above ~46 h are not available for every hour of the day.**
* No duplicate `(publishTime, startTime)` pairs and no nulls. The range was 2,051–21,353 MW.
* **Irregularity:** on 2026-01-15 the 11:30 publish arrived at **12:25** instead.
  FUELHH was also late that day (published 12:25–12:26 for periods 10:00–11:30), which points to a
  platform incident. The selection logic must cope with irregular publish times.

### FUELHH (actuals, fuelType = WIND)
* Half-hourly (`startTime` on :00 and :30). 1,536 rows for 2026-01-01..2026-02-01, which is 32 days × 48,
  with **no gaps and no duplicate startTimes**.
* Normally published 30 min after `startTime`. Four periods on 2026-01-15 were late (see above).
* In January `settlementDate` equals the UTC date because London is on GMT. Across a DST change it would not,
  so we key everything on `startTime` and do not use settlementDate/period.
* The range was 1,695–17,805 MW.

## Data quality handling (implemented in ingestion and the domain layer)

| Issue | Handling |
|---|---|
| Duplicates | Upsert on natural keys: actuals `(start_time)`, keeping the greatest publishTime (a later revision wins); forecasts `(publish_time, start_time)`. Counts are reported by the ingest CLI. |
| Missing periods | Never filled. A target with no actual or no eligible forecast is excluded from metrics and counted in a `coverage` block that every metrics response returns. |
| Past-dated forecast points | Forecasts with `publishTime > startTime` (negative horizon) are kept in storage but can never be selected, because selection requires horizon ≥ 0. |
| Timezones | Stored as UTC ISO-8601. Delivery days and the cutoff are computed in `Europe/London` with `zoneinfo`. `tzdata` is a declared dependency because Windows has no system tz database. The UI renders Europe/London. |
| Resolution mismatch | See *Alignment* below. |

## Alignment (hourly forecast vs half-hourly actual)

Chosen strategy: **evaluate on the hourly forecast grid. The actual for forecast hour T is the
mean of the two half-hourly actuals starting at T and T+30 min.** Both half-hours must be present,
otherwise the hour is excluded.

Reasoning:
* We never fabricate forecast values by interpolating between hourly points.
* Averaging MW over two half-hours gives the energy-equivalent average for the hour, which is what a trader
  buying hourly day-ahead blocks is exposed to.
* Sensitivity check on January 2026 (11:00 cutoff, n = 744 hours):

  | Strategy | MAE | RMSE | Bias |
  |---|---|---|---|
  | hour-mean (chosen) | 2,013 MW | 2,506 MW | +1,730 MW |
  | point match (actual at :00 only) | 1,996 MW | 2,499 MW | +1,728 MW |

  The difference is below 1 %, so the conclusions do not depend on this choice. A config option
  (`ALIGNMENT=hour_mean|point`) is kept so that a reviewer can verify this.

## Early observation

Forecasts run about **1.7 GW above** metered wind output on average. A plausible explanation, not
verified here because we deliberately use no other datasets, is that WINDFOR forecasts available
wind generation while FUELHH records metered output *after* constraint curtailment. Whatever the
cause, it is the error the trader is exposed to, and the analysis quantifies it rather than correcting it away.

## Appendix: probe commands

```bash
B=https://data.elexon.co.uk/bmrs/api/v1/datasets
curl "$B/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00Z&publishDateTimeTo=2026-02-02T00:00Z"
curl "$B/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-02-01&fuelType=WIND"
curl "$B/WINDFOR/stream?publishDateTimeFrom=notadate"   # -> 400 problem JSON
```
