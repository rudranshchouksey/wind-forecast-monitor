# Phase 1 plan

Status: **approved with changes** (kept as the historical phase-1 proposal). The API findings are in [data-notes.md](data-notes.md).

Changes made at approval:
1. Default cutoff is **D-1 09:20 Europe/London** (earliest GB day-ahead gate closure), with 09:50 and 11:00 as presets ([ADR 0002](adr/0002-decision-cutoff.md)).
2. Python 3.12 and dependencies are managed with **uv** (`pyproject.toml` + `uv.lock`), also in Docker and CI. Nothing is installed system-wide.
3. The ~1.7 GW bias was **investigated before being presented** ([analysis.md §3](analysis.md#3-is-the-bias-real-investigation)), and the buffer carries a caveat.
4. The Vercel bundle size was checked in phase 2: 116 MB unzipped against a 250 MB limit.

## 1. Scope

* Delivery days D = **2026-01-02 … 2026-02-01** (Europe/London days), i.e. decisions on 2026-01-01 … 2026-01-31.
  Set by `DELIVERY_FROM` / `DELIVERY_TO`.
* Ingest window, derived automatically: forecasts published from `DELIVERY_FROM − 3 days` (to cover the 72 h
  horizon) to the end of `DELIVERY_TO`, and actuals for the delivery days.

## 2. Repo structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI routers (v1), dependencies, error handlers
│   │   ├── services/       # domain logic: selection.py (cutoff/horizon), metrics.py, insight.py, analysis.py
│   │   ├── clients/        # elexon.py: async httpx client, retries/backoff/timeouts, chunking
│   │   ├── repositories/   # sqlite repository (read/write), schema migration
│   │   ├── models/         # pydantic v2 schemas: domain records + API responses
│   │   ├── core/           # settings (pydantic-settings), logging, time utilities (London/UTC)
│   │   ├── ingest.py       # CLI: python -m app.ingest --from 2026-01-02 --to 2026-02-01
│   │   └── main.py         # app factory; also serves the built frontend when present
│   ├── tests/              # unit (selection, metrics fixtures), api (TestClient + respx mocks), ingest
│   ├── data/wind.sqlite    # bundled snapshot (~3 MB) so the demo works offline
│   └── pyproject.toml      # deps + ruff + mypy(strict) + pytest/coverage config
├── frontend/
│   ├── src/
│   │   ├── api/            # typed client + TanStack Query hooks (types mirror OpenAPI)
│   │   ├── components/     # KpiTiles, MainChart, HorizonChart, HourChart, Histogram, Controls, Explainer, states
│   │   ├── lib/            # formatting (Europe/London), csv export
│   │   └── App.tsx
│   └── (vite, tailwind, eslint, prettier, vitest configs)
├── api/index.py            # Vercel entrypoint → imports backend app
├── docs/  (architecture.md, analysis.md, data-notes.md, video-script.md, adr/0001..0004)
├── Dockerfile  docker-compose.yml  vercel.json  Makefile  .env.example  .pre-commit-config.yaml
└── .github/workflows/ci.yml
```

## 3. Data model (SQLite)

```sql
CREATE TABLE actuals   (start_time TEXT PRIMARY KEY,           -- UTC ISO, half-hourly
                        generation_mw REAL NOT NULL, publish_time TEXT NOT NULL);
CREATE TABLE forecasts (publish_time TEXT NOT NULL, start_time TEXT NOT NULL,   -- UTC ISO, hourly
                        generation_mw REAL NOT NULL, PRIMARY KEY (publish_time, start_time));
CREATE INDEX ix_fc_start ON forecasts(start_time, publish_time);
CREATE TABLE ingest_runs (id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, params TEXT,
                          actual_rows INT, forecast_rows INT, duplicates INT, status TEXT);
```

The raw publish history is stored as-is. All selection happens at query time, so any cutoff or horizon
can be evaluated without re-ingesting. The data is about 25k rows and loads into pandas in milliseconds,
and results are memoised per parameter set.

## 4. Core domain definitions

**Delivery day of a target** `T` = the Europe/London calendar date of `T`.

**Decision cutoff** for delivery day D: `(D − 1 day) at CUTOFF_LOCAL_TIME in Europe/London` → UTC.
DST is handled because the time is localised before conversion.

**Latest-available forecast (cutoff mode)** for target T:
`argmax publish_time  s.t.  publish_time ≤ cutoff(day(T))  and  publish_time ≤ T`.
Ties are impossible because the PK is unique. If no forecast is eligible, the target is excluded and counted in coverage.

**Horizon mode** (h hours): `argmax publish_time s.t. publish_time ≤ T − h`. Valid h: 0–66, default list
`[1, 4, 8, 12, 24, 36, 48]`. Above ~46 h only some hours of the day are covered, and the API reports coverage per horizon so this is visible.

**Cutoff default and GB auction timings.** The brief's default is **D-1 11:00 London**, and I will keep it. The
GB day-ahead auctions actually close *earlier*: since Brexit, EPEX's GB hourly auction closes at about
**09:20 UK** and Nord Pool's N2EX GB auction at **09:50 UK**. The EPEX GB half-hourly auction runs later, in the afternoon. With an 11:00 cutoff the selected forecast is the 09:30 UTC publish, which is *after* the 09:20 EPEX gate.
For a trader in the EPEX hourly auction that is strictly look-ahead. The ADR will document this and the UI will offer
cutoff presets (09:20 / 09:50 / 11:00). On January data the effect is small (MAE 2,039 vs 2,013 MW), and the analysis will say so.

Unit tests (written before the implementation): forecast published exactly at the cutoff is included, 1 s after is excluded;
targets at 00:00 and 23:00 London share D-1's cutoff; a target at 00:00 D+1 switches to D's cutoff; DST spring/autumn days
(23 h and 25 h); a later publish with a revised value is ignored when it is past the cutoff; no eligible forecast; the 12:25
irregular publish; a property-style test over random data asserting `selected.publish_time ≤ cutoff` for every row.

**Metrics** on `e = forecast − actual` (positive = over-forecast, i.e. wind under-delivered):
MAE, RMSE, mean bias, MAPE (only where actual ≥ `MAPE_MIN_ACTUAL_MW`, default 1,000 MW, with n reported),
P50/P90/P99 of |e|, and directional percentiles: P50/P90/P99 of the shortfall `max(e,0)` over
under-delivery hours and of the surplus over over-delivery hours. Fixtures are checked against hand-computed values.

**Buffer insight:** buffer = the P-th percentile (default 90, selectable) of `e` over all hours, clipped at 0. Holding
`forecast − buffer` covers actual wind in P% of hours. The API also returns the empirical coverage obtained by applying the buffer back to the data, as a self-check.

## 5. API contract (`/api/v1`, JSON, OpenAPI at `/docs`)

Common query params, validated by Pydantic: `from`, `to` (delivery dates), `mode=cutoff|horizon`,
`cutoff_time=HH:MM` (default 11:00), `horizon_h` (0–66), `percentile` (50–99).

| Endpoint | Returns |
|---|---|
| `GET /health` | status, data snapshot range, last ingest |
| `GET /forecast-vs-actual` | rows `{target_time, actual_mw, forecast_mw, publish_time, horizon_h, error_mw}`. Add `?format=csv` for export |
| `GET /metrics` | KPI block + coverage + insight sentence |
| `GET /metrics/by-horizon` | metrics for each horizon in `horizons=1,4,…` |
| `GET /metrics/by-hour` | metrics by London hour 0–23 |
| `GET /metrics/by-day` | metrics by delivery day |
| `GET /error-distribution` | histogram bins (`bin_mw` param) + percentile markers |
| `POST /admin/refresh` | re-ingest (disabled unless `REFRESH_TOKEN` is set; never enabled on the read-only Vercel deploy) |

Errors use problem-JSON `{type,title,status,detail}` for 400/404/422/503. Responses have `Cache-Control` headers plus an in-process LRU cache keyed by params.

## 6. Deployment choice: **Vercel**, with Docker as the portable fallback

* Vercel serves the Vite build from its CDN and runs FastAPI as one Python function, with the SQLite snapshot bundled read-only. It costs nothing on the Hobby plan.
* Heroku no longer has a free tier, so a reviewer link would need a paid dyno.
* Risks: the 250 MB function limit (pandas + numpy is about 120 MB, which fits; no polars) and cold starts (about 1–2 s, acceptable for a demo).
  If the size limit bites, the fallback is the same Docker image on Heroku via `heroku.yml`. The ADR will record whichever is used.
* You will need to run `vercel login` and `vercel --prod` yourself. I will prepare everything and tell you exactly when.

## 7. Environment notes

* The machine has Python 3.14 and 3.9, not **3.12**. In Phase 2 I'd install Python 3.12 (`winget install Python.Python.3.12`)
  and create a venv. Docker/CI pin `python:3.12-slim`.
* Git is initialised with a local anonymous identity (`kjhwr <kjhwr@users.noreply.github.com>`). Nothing personal goes in the repo.
