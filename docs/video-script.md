# Video script (≤ 10 minutes)

Two parts of at most 5 minutes each, about 540 spoken words per part at a calm pace (~130 words per
minute), which leaves about 30 s of slack for clicking. **[Screen]** lines are what to show;
everything else is spoken. Record against the production build (Docker or the live URL), in a
1440 px wide browser window, light mode, with the default settings (09:20 cutoff, 90 %, offset included).

Upload as one **unlisted** YouTube video with chapters: `0:00 Part 1 – Client pitch` and
`5:00 Part 2 – Tech-lead review`.

---

## Part 1: Client pitch (≤ 5 min)

| Time | Section | Length |
|---|---|---|
| 0:00 | The problem | 40 s |
| 0:40 | What makes this trustworthy | 40 s |
| 1:20 | Demo walkthrough | 1 min 25 s |
| 2:45 | The number you can use | 1 min 25 s |
| 4:10 | How you'd use it | 40 s |
| 4:50 | end, 10 s of slack | |

### 0:00 The problem (40 s)
**[Screen: dashboard, top of the page]**

Every morning your traders decide how much power to buy in the day-ahead auction. Wind is the
biggest unknown in that position. If the forecast says 15 gigawatts and only 12 arrive, you're short
by 3 gigawatts and you buy them back at intraday or imbalance prices.

So the question isn't "is the forecast good?" It's: **how much of the forecast should we count on, at
the moment we actually have to decide?** This tool answers that from Elexon's own data.

### 0:40 What makes this trustworthy (40 s)
**[Screen: controls row; open the "Decision cutoff (D-1, London)" dropdown]**

Most accuracy reports quietly cheat: they score the *latest* forecast, including ones published after
the auction closed. We don't. For each delivery day we take the forecast that was available at **09:20
the day before**, the earliest GB day-ahead gate closure (EPEX). If you trade on Nord Pool, pick the
09:50 preset. Nothing published after the cutoff is ever used. Automated tests prove that rule, and I
re-checked sample hours against Elexon's live API.

### 1:20 Demo walkthrough (1 min 25 s)
**[Screen: the five KPI tiles; hover the "i" on "Worst 1% of hours"]**

Across January, the forecast missed by about **2,000 megawatts** in a typical hour, and by more than
6,200 in the worst 1 % of hours. Every tile has its exact definition one tap away.

**[Screen: "Actual vs forecast"; drag the handles under the chart to 10–13 Jan, then back]**
Orange is the forecast you had, blue is what was delivered. Orange sits above blue almost all month.
Zoom into 11 and 12 January: the forecast was too high in every hour, by about 4.8 gigawatts on average.

**[Screen: "Error distribution", point at the red bars]**
Wind came in **below forecast 85 % of the time**, and the shortfalls were more than twice the size of
the surpluses. Your risk is one-sided.

**[Screen: click "At fixed lead time", move the "Lead time" slider to 4 h, then 48 h; switch back to "At decision cutoff"]**
This mode asks how a forecast made a fixed time ahead would have done. Four hours out is only about
15 % better than what you have at the cutoff, and two days out is about 13 % worse.

### 2:45 The number you can use (1 min 25 s)
**[Screen: "Suggested buffer (P90)" tile and the "Procurement takeaway" card]**

The actionable output: **to be covered in 90 % of hours, plan on about 4,100 megawatts less wind than
the day-ahead forecast.** For 95 % cover it's about 5,300; you set that under "Buffer covers".

We tested it honestly: a buffer sized on the first half of January covered **90.6 %** of hours in the
second half.

**[Screen: expand "Is the bias forecast error? (diagnostics)"; then click "Random error only" under "Buffer basis"]**
One point we don't gloss over: about 1.5 gigawatts of that buffer is a **persistent offset** between
Elexon's forecast and its metered outturn. It's there even for hours that had already happened, and it
grows with wind level, from half a gigawatt in light wind to 2.7 in strong wind. Curtailment or a
difference in farm coverage could explain it. Neither is confirmed, and the tool says so. This toggle
shows the buffer without the offset, 2,350 MW, and warns that against metered wind it would have
covered only 68 % of hours.

**[Screen: click "Include systematic offset" again; tick "Show on main chart" in "Bias-corrected forecast"]**
A simple correction learned from the previous week, using past data only, cuts the typical miss by
**23 %**, from 2,039 to 1,568 MW.

### 4:10 How you'd use it (40 s)
**[Screen: "Export CSV" button, then scroll to "How to read this"]**

Three uses. First, set the daily wind haircut in your purchase model from this number instead of gut
feel. Second, hold extra cover overnight, 3 to 5 a.m., and on high-wind days, where the misses are
biggest. Third, export the hourly data into your own risk tools. The tool runs from a cached snapshot,
so it's fast and keeps working when Elexon is down.

---

## Part 2: Tech-lead review (≤ 5 min)

| Time | Section | Length |
|---|---|---|
| 5:00 | Architecture | 45 s |
| 5:45 | Data findings that shaped the code | 35 s |
| 6:20 | Cutoff and leakage logic | 1 min 10 s |
| 7:30 | Code tour order | 30 s |
| 8:00 | Testing, CI and running it | 55 s |
| 8:55 | Trade-offs and next steps | 50 s |
| 9:45 | end, 15 s of slack | |

### Files to show in Part 2 (open these tabs before recording)

1. `README.md` (architecture diagram, Quick start)
2. `docs/architecture.md`
3. `docs/data-notes.md`
4. `backend/app/services/selection.py`
5. `backend/tests/unit/test_selection.py`
6. `docs/adr/0002-decision-cutoff.md`
7. `backend/app/services/correction.py` and `backend/tests/unit/test_correction.py`
8. `docs/analysis.md` §9 (live Elexon spot-check)
9. `frontend/src/api/client.ts` and `frontend/src/components/states.tsx`
10. `.github/workflows/ci.yml`
11. a terminal with `uv run pytest --cov=app` output, and `dev.ps1`
12. `docs/adr/0001-storage-sqlite-snapshot.md`, `docs/adr/0003-deployment-target.md`

### 5:00 Architecture (45 s)
**[Screen: README mermaid diagram, then docs/architecture.md]**

Two halves, deliberately decoupled. **Ingestion** is the only code that talks to Elexon. It's an async
httpx client with chunking, retries, backoff with jitter, and response validation, writing raw,
de-duplicated rows into SQLite. **Serving** reads only that snapshot. The full forecast publish history
is stored, not a pre-selected series, so any cutoff or lead time is computed at query time. The backend
is layered: core, models, clients, repositories, services, api. Services are pure functions over pandas
frames.

### 5:45 Data findings that shaped the code (35 s)
**[Screen: docs/data-notes.md]**

I verified the API before writing the client. WINDFOR publishes eight times a day; each publish is 73
hourly points starting at 21:00 the day *before*, so some rows describe hours already over. Those can
never be selected. Actuals are half-hourly, and we average them to hourly (ADR 4). An irregular 12:25
publish on 15 January is handled and covered by a test.

### 6:20 Cutoff and leakage logic (1 min 10 s)
**[Screen: backend/app/services/selection.py]**

This is the core. The cutoff per target is D-1 at 09:20 *London*, localised then converted to UTC, so
23- and 25-hour DST days are exact. A row is eligible if `publish_time ≤ decision_time` and `≤ target`,
and we take the latest eligible row per target.

**[Screen: backend/tests/unit/test_selection.py]**
A publish exactly at the cutoff is included; one second later it's excluded. Both DST days are covered,
and 25 seeded random datasets are checked against a brute-force reference.

**[Screen: ADR 0002, then correction.py + test_correction.py]**
The default is 09:20 because an 11:00 cutoff would pick the 09:30 forecast, after EPEX's gate. That's
look-ahead. The bias correction follows the same discipline: day D is fitted only on days D-8 to D-2.
A test perturbs every later actual and asserts D's output is bit-for-bit identical; a control test
proves it would catch D-2.

**[Screen: docs/analysis.md §9]**
And three hours re-fetched from Elexon's live API match to the megawatt, including the publish chosen.

### 7:30 Code tour order (30 s)
**[Screen: file tree]**

Read it in this order: `core/timeutils.py`, `services/selection.py`, `alignment.py`, `metrics.py`
(sign convention at the top), `insight.py`, then `analysis.py` for orchestration and caching. Then the
routers in `api/v1`, and on the frontend `api/client.ts`, `hooks.ts` and `ChartCard.tsx`.

### 8:00 Testing, CI and running it (55 s)
**[Screen: pytest output with coverage, then .github/workflows/ci.yml]**

The backend has 149 tests at 99 % coverage, gated at 85 % on services, with Elexon mocked via respx.
The frontend has 55 Vitest and Testing Library tests. CI runs ruff, mypy strict, eslint, prettier and
tsc, then builds the Docker image, plus a fresh-checkout `make dev`, and smoke-tests every endpoint.

**[Screen: client.ts / states.tsx, then dev.ps1]**
Small things for the next developer: if the API isn't running, the dashboard says "Can't reach the API"
and retries with backoff instead of showing a bare 500. Real API errors keep their problem+json detail.
On Windows, `dev.ps1` stops with a clear message when Docker already holds port 8000.

### 8:55 Trade-offs and next steps (50 s)
**[Screen: ADR 0001 / 0003, README Future work]**

SQLite plus in-memory pandas is the right size for 25 thousand rows: zero ops and fast cold starts.
Postgres becomes worthwhile with years of data or multiple writers. Vercel is free and CDN-fast; the cost
is a read-only filesystem, so refresh means redeploying, and the same Docker image runs anywhere
writable. The function bundle is 117 MB against a 250 MB limit.

Next steps: test the two offset hypotheses with other BMRS data, extend to a full year, size buffers by
forecast level and hour, and generate the TypeScript types from OpenAPI.
