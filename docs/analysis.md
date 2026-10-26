# January 2026 findings

Scope: delivery days **2 January to 1 February 2026** (decisions made 1 to 31 January), national wind,
Elexon BMRS only. Forecast = WINDFOR, actual = FUELHH `WIND` averaged to hourly
([ADR 0004](adr/0004-forecast-actual-alignment.md)). Error = **forecast − actual**: positive is a
**shortfall** (less wind than planned for, so the buyer is short).

Every number below is printed by `backend/scripts/analysis_report.py` from the bundled snapshot.
Section 9 checks sample hours of that snapshot against the live Elexon API.

## 1. Headline: forecasts available at the D-1 09:20 cutoff

All **744 of 744** hours were evaluated. The forecast used is the 07:30 UTC publish on D-1, with lead times
of 16.5–39.5 h (mean 28 h).

| Metric | Value |
|---|---|
| Mean absolute error | **2,039 MW** |
| RMSE | 2,505 MW |
| Mean bias | **+1,748 MW** (forecasts ran high) |
| MAPE (hours with actual ≥ 1,000 MW: all 744) | 22.0 % |
| Absolute error P50 / P90 / P99 | 1,671 / 4,098 / 6,261 MW |
| Hours with a shortfall | **632 (84.9 %)** |
| Shortfall P50 / P90 / P99 / max (shortfall hours only) | 1,868 / 4,377 / 6,358 / 6,870 MW |
| Worst 1 % of hours (P99 of error, all hours) | **6,261 MW** |
| Hours with a surplus | 112 (15.1 %) |
| Surplus P50 / P90 / P99 / max | 824 / 1,991 / 3,202 / 3,550 MW |

**Errors are strongly one-sided.** Wind came in below the day-ahead forecast in 85 % of hours, and
shortfalls are more than twice the size of surpluses (mean 2,229 vs 967 MW). For procurement, the risk
sits almost entirely on the "short" side.

## 2. Buffer to hold

Two bases, selectable in the dashboard (`buffer_basis` in the API):

- **Include systematic offset** (default): buffer = P-th percentile of the error over all evaluated
  hours. Planning on `forecast − buffer` MW of wind would have covered actual wind in P % of hours.
- **Random error only**: buffer = P-th percentile of `error − mean error`. It covers P % of the
  hour-to-hour variation, on the assumption that the persistent offset does not appear in the
  measure your position settles against.

| Coverage target | Buffer (incl. offset) | = persistent offset | + random component (= random-only buffer) | Achieved |
|---|---|---|---|---|
| 80 % | 3,104 MW | 1,748 | 1,356 | 80.0 % |
| **90 %** | **4,098 MW** | 1,748 | 2,350 | 89.9 % |
| 95 % | 5,283 MW | 1,748 | 3,535 | 94.9 % |
| 99 % | 6,261 MW | 1,748 | 4,513 | 98.9 % |

The random-only P90 buffer (2,350 MW) covers 89.9 % of hours once the mean offset is removed, but
**only 67.9 % of hours measured against FUELHH as published**. The dashboard says so next to it.

The "Worst 1 % of hours" tile is the 99th percentile of the same error over the same hours
(6,261 MW), so it is directly comparable with the buffer. An earlier "P90 shortfall" tile used only
the hours with a shortfall, a different population, and was dropped to avoid that confusion.

**Out-of-sample check.** A buffer sized on 2–16 January only (P90: 4,170 MW) covered **90.6 %** of hours
in 17 January – 1 February. The P95 buffer (5,376 MW) covered 96.6 %. The figure is stable within the month.
One month is still a short, single-season sample (see Limitations).

## 3. Is the bias real? (investigation)

A 1.7 GW average over-forecast is large: it is 13 % of the mean forecast (13,031 MW; mean actual
11,284 MW). Before presenting it as forecast error, we checked whether it is something else.

**What Elexon's documentation says** (API spec, dataset descriptions):
- WINDFOR: *"wind generation forecast for wind farms which are visible to the ESO and have operational metering."*
- FUELHH / generation by fuel type: WIND covers wind farms with operational metering; the
  fuel-type report notes that embedded generation and farms without operational meters are
  **excluded**, so renewable outturn is "underestimated in this report".
- Neither source says whether WINDFOR forecasts *potential* (pre-curtailment) output or *metered*
  output after constraint actions.

So on paper both series cover the same population (operationally metered farms). The documentation
does **not** explain a systematic gap.

**What the two datasets themselves show:**

| Test | Result | Interpretation |
|---|---|---|
| Bias vs lead time | +1,473 MW at 0 h, +1,651 at 16 h, +1,748 at the cutoff (28 h mean) | Getting closer to real time barely reduces it |
| WINDFOR values for hours that had **already ended** (0–3 h before publish) vs FUELHH | **+1,525 MW**, mean actual/forecast 0.89, n = 744 | The gap remains with no weather uncertainty left |
| Linear fit | actual = 743 + 0.809 × forecast (corr 0.93) | Roughly proportional shortfall |
| Days with negative bias | 4 of 31 | Persistent, not a few bad days |

### The bias grows with forecast level

**The bias grows with forecast level: +0.5 GW when the forecast is 0–5 GW, rising to +2.7 GW at
15–30 GW.**

| Level | Grouped by forecast (cutoff) | Already-ended hours, by WINDFOR level | Already-ended hours, by actual level | Cutoff, by actual level |
|---|---|---|---|---|
| 0–5 GW | +539 MW (n 31) | +448 (n 43) | +844 (n 65) | +2,150 (n 62) |
| 5–10 GW | +770 (n 214) | +692 (n 226) | +939 (n 246) | +1,199 (n 245) |
| 10–15 GW | +1,588 (n 201) | +900 (n 175) | +1,755 (n 252) | +1,897 (n 247) |
| 15–30 GW | **+2,683** (n 298) | **+2,670** (n 300) | **+2,244** (n 181) | +2,130 (n 190) |

Grouping by *forecast* level alone exaggerates the top bucket: hours picked for a high forecast are
enriched for over-forecasts (regression to the mean). The rise is not just that artefact, though:

- WINDFOR's values for hours that had **already ended** carry little weather error, and they show the
  same rise (+0.4 → +2.7 GW).
- Grouped by *actual* level, which biases the other way, they still rise (+0.8 → +2.2 GW).
- For the day-ahead forecasts grouped by actual level, the bias is high at every level
  (1.2–2.2 GW) without a clean trend. The weather error of a 28-hour forecast dominates that view.

**Possible explanations. These are unconfirmed hypotheses, and neither is claimed:**

1. **Curtailment at high wind.** FUELHH is metered output *after* constraint actions. If WINDFOR
   forecasts the output the farms could produce, the gap would widen at high wind, when transmission
   constraints force the most curtailment.
2. **Capacity counted in WINDFOR but not in FUELHH.** If the forecast covers farms that are not in
   FUELHH's WIND set (for example capacity mapped to a different fuel category, or newly commissioned
   units), the gap would scale roughly in proportion to total output.

The data loosely fits both: the actual/forecast ratio is about 0.88–0.93 below 15 GW and 0.86 above,
which looks like a proportional component plus extra loss at high wind. One winter month cannot
separate them. Elexon's documentation says both datasets cover operationally metered wind farms and
does not settle the question. Testing (1) would need other BMRS datasets (for example bid-offer
acceptances for wind units), which this project deliberately does not use.

**Conclusion.** About **1.5 GW of the 1.75 GW bias is a systematic offset between WINDFOR and FUELHH**,
not weather-forecast skill. It grows with output. Its cause is unconfirmed.

**What it means for the buffer.** If your shortfall exposure is measured like FUELHH (metered
transmission wind), the full buffer applies: the offset is real, repeatable and in your position. If
your exposure is settled against a different measure, use the **random-only** buffer (2,350 MW at
P90). Remember it covers only 68 % of hours against FUELHH. The dashboard shows this caveat next to
the recommendation.

## 4. Bias-corrected forecast (rolling, no look-ahead)

For each delivery day D we fit `actual ≈ a × forecast + b` (ordinary least squares) on the 7 complete
delivery days **D-8 … D-2**, using the forecasts that were available at *their* cutoffs, and apply it
to D's cutoff forecast. Day D-1 is excluded because it is not complete at the D-1 09:20 decision.
Eight days of history before 2 January are ingested so that every January day can be corrected.
A day whose training forecasts are flat gets no correction rather than an unstable fit.

| | Raw WINDFOR (09:20 cutoff) | Bias-corrected | Change |
|---|---|---|---|
| MAE | 2,039 MW | **1,568 MW** | **−23 %** |
| RMSE | 2,505 MW | 2,017 MW | −19 % |
| Bias | +1,748 MW | +449 MW | |
| Absolute error P90 | 4,098 MW | 3,486 MW | |
| Hours with a shortfall | 84.9 % | 56.0 % | |

31 of 31 days were corrected (744 hours). About a quarter of the offset remains, because a fitted
line lags changes in wind regime from week to week.

**Leakage tests** (`backend/tests/unit/test_correction.py`):
- Perturbing every actual from D-1 onward, and every forecast after D, leaves D's corrected values
  bit-for-bit unchanged.
- A control test shows that perturbing D-2, which *is* known, does change them, so the first test is
  sensitive.
- Every fit's last training day is D-2 and ends before the D-1 cutoff, for any cutoff time.

This is an illustration of how much of the error is correctable, not a production forecast. It is shown
as an optional dashed series and does not change the buffer figures above.

## 5. Accuracy vs lead time

| Lead time | Hours covered | MAE | RMSE | Bias | P90 shortfall |
|---|---|---|---|---|---|
| 0 h | 744 (100 %) | 1,687 | 2,150 | +1,473 | 3,586 |
| 1 h | 744 | 1,691 | 2,162 | +1,474 | 3,605 |
| 4 h | 744 | 1,730 | 2,209 | +1,526 | 3,784 |
| 8 h | 744 | 1,792 | 2,254 | +1,590 | 3,902 |
| 12 h | 744 | 1,803 | 2,271 | +1,597 | 3,883 |
| 24 h | 744 | 1,948 | 2,407 | +1,738 | 3,990 |
| 36 h | 744 | 2,156 | 2,657 | +1,836 | 4,440 |
| 48 h | 589 (79 %) | 2,310 | 2,874 | +1,791 | 5,079 |
| 60 h | 217 (29 %) | 2,330 | 3,011 | +870 | 5,074 |

MAE rises gently to about 24 h and then faster: **+37 % from 1 h to 48 h**. Beyond about 46 h, WINDFOR (72 h
window from 21:00 the day before publish) cannot cover every hour of the day, so the 48 h and 60 h rows
come from a biased subset of hours. Their bias figures in particular should not be compared directly.

## 6. Cutoff sensitivity

| Cutoff (D-1, London) | Forecast used | Mean lead | MAE | Bias | P90 shortfall | P90 buffer |
|---|---|---|---|---|---|---|
| **09:20** (EPEX, default) | 07:30 UTC publish | 28.0 h | 2,039 | +1,748 | 4,377 | 4,098 |
| 09:50 (N2EX) | 09:30 publish | 26.0 h | 2,013 | +1,730 | 4,439 | 4,144 |
| 11:00 (legacy) | 09:30 publish | 26.0 h | 2,013 | +1,730 | 4,439 | 4,144 |

The two later cutoffs pick the same publish, because nothing is published between 09:30 and 11:30.
Moving from 09:20 to 09:50 improves MAE by only 26 MW and slightly *worsens* the tail (P90 shortfall
+62 MW). Using the conservative 09:20 cutoff therefore costs almost nothing, and it removes look-ahead for EPEX
participants.

## 7. When errors are largest

- **Hour of day** (London): the worst hours are 03:00–05:00 (MAE about 2,410–2,430 MW, bias about +2,330 MW).
  The best are 21:00–22:00 and 15:00 (MAE about 1,790–1,820 MW). The overnight hours are also the longest
  lead times from a D-1 forecast.
- **Days**: the bias exceeded 4.8 GW on 11, 12 and 28 January (on these days the forecast was above actual in
  every hour: MAE = bias). Only 4 days (5, 10, 14, 19 Jan) had a negative bias.

## 8. Recommendations for purchasing

1. **Plan on about 4.1 GW less wind than the D-1 09:20 forecast** to be covered in 90 % of hours (about 5.3 GW
   for 95 %).
2. **Treat about 1.5–1.7 GW of that as a standing correction**, not a risk premium. It is persistent and
   grows with the forecast (≈ 0.86× at high wind). A rolling 7-day linear correction, using past days only,
   removes about three quarters of it (MAE −23 %). Confirm with your settlement data which measure of
   wind your position is exposed to before relying on it.
3. **Add more cover overnight (03:00–05:00)** and on high-wind days, where both bias and spread are largest.
4. **Don't wait for later forecasts to fix the bias.** Moving to a 1–4 h forecast cuts MAE by only
   15–17 % (2,039 → 1,691–1,730 MW), because most of the error is the offset.

## 9. Data check against the live Elexon API

Three hours were re-fetched straight from Elexon on 27 October 2026 and compared with what this app
serves (`GET /forecast-vs-actual`, 09:20 cutoff), using `backend/scripts/spot_check.py`. The hours
were chosen to cover low wind, a large over-forecast and an overnight high-wind hour.

| Target hour (UTC) | Publish used | Our forecast (MW) | Elexon WINDFOR | Our actual (MW) | Elexon FUELHH, two half-hours → mean | Later publishes ≤ cutoff | Match |
|---|---|---|---|---|---|---|---|
| 08 Jan 06:00 | 07 Jan 07:30 | 4,894 | 4,894 | 1,878.0 | 2,009 + 1,747 → 1,878.0 | 0 | yes |
| 12 Jan 17:00 | 11 Jan 07:30 | 18,235 | 18,235 | 14,804.0 | 14,749 + 14,859 → 14,804.0 | 0 | yes |
| 27 Jan 03:00 | 26 Jan 07:30 | 20,043 | 20,043 | 17,228.5 | 17,331 + 17,126 → 17,228.5 | 0 | yes |

All three match exactly:
- **Forecast.** Each value equals the WINDFOR value in that publish for the target hour.
- **Actual.** Each value equals the mean of FUELHH `WIND` for the half-hours starting at T and T+30 min.
- **Selection.** Elexon has no WINDFOR publish after 07:30 and at or before 09:20 on D-1, so the
  07:30 publish was the latest one available at the cutoff. The check is sensitive: widening the
  window to 09:30 returns the 09:30 publish.

Re-run it with:
```
cd backend
uv run python scripts/spot_check.py --api http://localhost:8000 2026-01-08T06:00Z 2026-01-12T17:00Z 2026-01-27T03:00Z
```

## Limitations
- One month, one season (winter): wind regimes, curtailment patterns and the offset may differ in summer.
- National level only; portfolio-level exposure is not modelled.
- No demand or price data, so the buffer is sized in MW of wind, not in £ cost of being short or long.
- The cause of the offset is unconfirmed (section 3).
