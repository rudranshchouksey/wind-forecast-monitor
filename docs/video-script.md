# Video script (≤ 10 minutes)

Two parts of about 5 minutes each (~650 spoken words per part). **[Screen]** lines are what to show;
everything else is spoken.

---

## Part 1: Client pitch (5 min)

### 0:00 The problem (45 s)
**[Screen: dashboard, top of page]**

Every morning your traders decide how much power to buy in the day-ahead auction. Wind is the
biggest unknown in that position. If the forecast says 15 gigawatts and only 12 arrive, you're short
by 3 gigawatts and you buy them back at intraday or imbalance prices.

So the question isn't "is the forecast good?" It's: **how much of the forecast should we count on, at
the moment we actually have to decide?** That's what this tool answers, using only Elexon's own data.

### 0:45 What makes this trustworthy (45 s)
**[Screen: controls row; open the cutoff dropdown]**

Most forecast-accuracy reports quietly cheat: they score the *latest* forecast, including ones
published after the auction closed. We don't. For each delivery day we take the forecast that was
available at **09:20 the day before**, which is the earliest GB day-ahead gate closure (EPEX). If you
trade on Nord Pool, switch the preset to 09:50. Nothing published after the cutoff is ever used, and that
rule is proven by automated tests.

### 1:30 Demo walkthrough (1 min 30 s)
**[Screen: KPI tiles → main chart; drag the brush to 10–13 Jan]**

Across January, the forecast missed by about **2,000 megawatts** on a typical hour. The main chart
shows why. Orange is the forecast you had, blue is what was delivered. The orange line sits above the blue
almost all month. Zoom into 11 and 12 January: the forecast was too high in every hour, by about
4.8 gigawatts on average.

**[Screen: histogram, point at the red mass]**
The distribution makes it plain: wind came in **below forecast 85 % of the time**, and the shortfalls
were more than twice the size of the surpluses. Your risk is one-sided.

**[Screen: lead-time chart; move the slider to 4 h, then 48 h]**
This slider shows how accuracy changes with lead time. A forecast 4 hours out is only about 15 % better
than the one you have at the cutoff, and beyond two days it gets markedly worse.

### 3:00 The number you can use (1 min 15 s)
**[Screen: procurement takeaway card]**

Here's the actionable output: **to be covered in 90 % of hours, plan on about 4,100 megawatts less wind
than the day-ahead forecast.** For 95 % cover it's about 5,300. You choose the confidence level here.

We tested it the honest way: we sized the buffer on the first half of January and applied it to the second
half. It covered **90.6 %** of hours, which matches the target.

**[Screen: expand "Is the bias forecast error?"]**
One point we deliberately don't gloss over: about 1.5 gigawatts of that buffer is a **persistent
offset** between Elexon's forecast and its metered outturn. It's there even for hours that had already
happened. Elexon's documentation doesn't explain it, so the dashboard flags it. In practice: if your
position settles against metered wind like this, hold the full buffer. If not, the random component,
about 2,350 MW, is the number to use.

### 4:15 How you'd use it (45 s)
**[Screen: Export CSV, explainer panel]**

Three uses. First, set the daily wind haircut in your purchase model from this number instead of
gut feel. Second, hold extra cover overnight (3 to 5 a.m.) and on high-wind days, where the misses are
biggest. Third, export the hourly data to your own risk tools. The tool runs from a cached snapshot, so
it's fast and keeps working even when Elexon is down.

---

## Part 2: Tech-lead review (5 min)

### 0:00 Architecture (50 s)
**[Screen: README mermaid diagram, then docs/architecture.md]**

Two halves, deliberately decoupled. **Ingestion** is the only code that talks to Elexon. It's an async
httpx client with chunking, retries, exponential backoff with jitter, and response validation. It writes
raw, de-duplicated rows into SQLite. **Serving** reads only that snapshot. The full forecast publish
history is stored, not a pre-selected series, so any cutoff or lead time is computed at query time.
The backend is layered: core, models, clients, repositories, services, api. Services are pure functions over
pandas frames.

### 0:50 Data findings that shaped the code (40 s)
**[Screen: docs/data-notes.md]**

I verified the API before writing the client. WINDFOR publishes eight times a day, and each publish is 73
hourly points starting at 21:00 the day *before*, so some rows describe hours already over. Those can
never be selected. Actuals are half-hourly; we average to hourly (ADR 4) and showed that a point match
changes MAE by under 1 %. On 15 January an irregular 12:25 publish is handled and covered by a test.

### 1:30 Cutoff and leakage logic (1 min 10 s)
**[Screen: open backend/app/services/selection.py]**

This is the core. Cutoff per target is D-1 at 09:20 *London*, localised then converted to UTC, so
23- and 25-hour DST days are exact. A row is eligible if `publish_time ≤ decision_time` and `≤ target`.
We take the latest eligible row per target. `decision_time` is returned in every API row, so a response
proves its own correctness.

**[Screen: backend/tests/unit/test_selection.py]**
Tests: a publish exactly at the cutoff is included and one second later excluded. 00:00 and 23:00 share D-1's
cutoff, while midnight of D+1 switches. Spring and autumn DST days are covered. And 25 seeded random datasets
are checked against a brute-force reference implementation, asserting no row ever leaks.

**[Screen: ADR 0002]** The default moved from 11:00 to 09:20 because the 11:00 cutoff picks the 09:30
forecast, which is after EPEX's gate. That's look-ahead.

### 2:40 Code tour order (40 s)
**[Screen: file tree]**

Open them in this order: `core/timeutils.py` → `services/selection.py` → `alignment.py` →
`metrics.py` (sign convention at the top) → `insight.py` → `analysis.py` (orchestration, coverage,
LRU cache) → `api/deps.py` and `api/v1/analysis.py` → `frontend/src/api/hooks.ts` →
`components/ChartCard.tsx` (loading, empty and error states plus a table view for every chart).

### 3:20 Testing and CI (50 s)
**[Screen: pytest output with coverage, then .github/workflows/ci.yml]**

The backend has 126 tests at 99 % coverage, with a CI gate of 85 % on services. Metrics are tested against
hand-calculated fixtures. A synthetic dataset where the error is exactly `500 + 10 × horizon` lets the service
tests assert exact values end to end. API tests cover validation, problem+json errors and refresh with
Elexon mocked via respx. The frontend has Vitest and Testing Library tests for tiles, controls, states and
the app with a mocked API. CI runs ruff, mypy strict, eslint strict, prettier, tsc and both test suites, builds
the Docker image and smoke-tests it.

### 4:10 Trade-offs and next steps (50 s)
**[Screen: ADR 0001 / 0003, README future work]**

SQLite plus in-memory pandas is the right size for 25k rows: zero ops and fast cold starts. Postgres
becomes worthwhile with years of data or multiple writers. Vercel is free and CDN-fast. The cost is a
read-only filesystem, so refresh means redeploying; the same Docker image runs anywhere writable. The
bundle size was measured early at 116 MB against a 250 MB limit.

Next steps: test the curtailment hypothesis with bid-offer acceptance data, extend to a full year,
size buffers conditionally on forecast level and hour, and generate the TypeScript types from OpenAPI.
