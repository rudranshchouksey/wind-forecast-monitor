# January 2026 findings

Scope: delivery days **2 January to 1 February 2026** (decisions made 1 to 31 January), national wind,
Elexon BMRS only. Forecast = WINDFOR, actual = FUELHH `WIND` averaged to hourly
([ADR 0004](adr/0004-forecast-actual-alignment.md)). Error = **forecast − actual**: positive is a
**shortfall** (less wind than planned for, so the buyer is short).

Every number below is printed by `backend/scripts/analysis_report.py` from the bundled snapshot.

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
| Shortfall P50 / P90 / P99 / max | 1,868 / **4,377** / 6,358 / 6,870 MW |
| Hours with a surplus | 112 (15.1 %) |
| Surplus P50 / P90 / P99 / max | 824 / 1,991 / 3,202 / 3,550 MW |

**Errors are strongly one-sided.** Wind came in below the day-ahead forecast in 85 % of hours, and
shortfalls are more than twice the size of surpluses (mean 2,229 vs 967 MW). For procurement, the risk
sits almost entirely on the "short" side.

## 2. Buffer to hold

Buffer = the P-th percentile of the error. Planning on `forecast − buffer` MW of wind would have
covered actual wind in P % of hours.

| Coverage target | Buffer | = persistent offset | + random component | Achieved |
|---|---|---|---|---|
| 80 % | 3,104 MW | 1,748 | 1,356 | 80.0 % |
| **90 %** | **4,098 MW** | 1,748 | 2,350 | 89.9 % |
| 95 % | 5,283 MW | 1,748 | 3,535 | 94.9 % |
| 99 % | 6,261 MW | 1,748 | 4,513 | 98.9 % |

**Out-of-sample check.** A buffer sized on 2–16 January only (P90: 4,170 MW) covered **90.6 %** of hours
in 17 January – 1 February. The P95 buffer (5,376 MW) covered 96.6 %. The figure is stable within the month.
One month is still a short, single-season sample (see Limitations).

## 3. Is the bias real? (investigation)

A 1.7 GW average over-forecast is large: it is 13 % of the mean forecast (13,031 MW; mean actual 11,284 MW). Before presenting it as
forecast error, we checked whether it is something else.

**What Elexon's documentation says** (API spec, dataset descriptions):
- WINDFOR: *"wind generation forecast for wind farms which are visible to the ESO and have operational metering."*
- FUELHH / generation by fuel type: WIND covers wind farms with operational metering; the
  fuel-type report notes that embedded generation and farms without operational meters are
  **excluded**, so renewable outturn is "underestimated in this report".
- Neither source says whether WINDFOR forecasts *potential* (pre-curtailment) output or *metered*
  output after constraint actions.

So on paper both series cover the same population (operationally metered farms). The documentation
does **not** explain a systematic gap, and it does not confirm the curtailment explanation.

**What the two datasets themselves show:**

| Test | Result | Interpretation |
|---|---|---|
| Bias vs lead time | +1,473 MW at 0 h, +1,651 at 16 h, +1,748 at the cutoff (28 h mean) | Getting closer to real time barely reduces it |
| WINDFOR values for hours that had **already ended** (0–3 h before publish) vs FUELHH | **+1,525 MW**, mean actual/forecast 0.89, n = 744 | The gap remains with no weather uncertainty left |
| Bias by forecast level | 0–5 GW: +539 · 5–10: +770 · 10–15: +1,588 · 15+ GW: **+2,683** MW | Grows with wind output; actual ≈ 0.86× forecast at high wind |
| Linear fit | actual = 743 + 0.809 × forecast (corr 0.93) | Roughly proportional shortfall |
| Days with negative bias | 4 of 31 | Persistent, not a few bad days |

**Conclusion.** About **1.5 GW of the 1.75 GW bias is a systematic offset between WINDFOR and FUELHH**,
not weather-forecast skill. The offset appears even in WINDFOR's own values for completed hours. It is
proportional to output, which would fit either (a) WINDFOR describing output before curtailment or
constraint actions while FUELHH is metered output after them, or (b) WINDFOR covering a somewhat wider
set of farms than FUELHH. **We cannot distinguish these using only these two datasets, and we do not
claim either.** Other BMRS data (for example bid-offer acceptances for wind units) could test (a); that is
listed as future work and deliberately kept out of scope.

**What it means for the buffer.** If your shortfall exposure is measured like FUELHH (metered
transmission wind), the full buffer applies: the offset is real, repeatable and in your position. If your
exposure is settled against a different measure, size the buffer from the **random component** instead
(2,350 MW at P90). Removing the mean offset cuts MAE from 2,039 MW to 1,376 MW. The dashboard shows
this caveat next to the recommendation.

## 4. Accuracy vs lead time

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

## 5. Cutoff sensitivity

| Cutoff (D-1, London) | Forecast used | Mean lead | MAE | Bias | P90 shortfall | P90 buffer |
|---|---|---|---|---|---|---|
| **09:20** (EPEX, default) | 07:30 UTC publish | 28.0 h | 2,039 | +1,748 | 4,377 | 4,098 |
| 09:50 (N2EX) | 09:30 publish | 26.0 h | 2,013 | +1,730 | 4,439 | 4,144 |
| 11:00 (legacy) | 09:30 publish | 26.0 h | 2,013 | +1,730 | 4,439 | 4,144 |

The two later cutoffs pick the same publish, because nothing is published between 09:30 and 11:30.
Moving from 09:20 to 09:50 improves MAE by only 26 MW and slightly *worsens* the tail (P90 shortfall
+62 MW). Using the conservative 09:20 cutoff therefore costs almost nothing, and it removes look-ahead for EPEX
participants.

## 6. When errors are largest

- **Hour of day** (London): the worst hours are 03:00–05:00 (MAE about 2,410–2,430 MW, bias about +2,330 MW).
  The best are 21:00–22:00 and 15:00 (MAE about 1,790–1,820 MW). The overnight hours are also the longest
  lead times from a D-1 forecast.
- **Days**: the bias exceeded 4.8 GW on 11, 12 and 28 January (on these days the forecast was above actual in
  every hour: MAE = bias). Only 4 days (5, 10, 14, 19 Jan) had a negative bias.

## 7. Recommendations for purchasing

1. **Plan on about 4.1 GW less wind than the D-1 09:20 forecast** to be covered in 90 % of hours (about 5.3 GW
   for 95 %).
2. **Treat about 1.5–1.7 GW of that as a standing correction**, not a risk premium. It is persistent and
   proportional to the forecast (≈ 0.86× at high wind). Confirm with your settlement data which measure
   of wind your position is exposed to before relying on it.
3. **Add more cover overnight (03:00–05:00)** and on high-wind days, where both bias and spread are largest.
4. **Don't wait for later forecasts to fix the bias.** Moving to a 1–4 h forecast cuts MAE by only
   15–17 % (2,039 → 1,691–1,730 MW), because most of the error is the offset.

## Limitations
- One month, one season (winter): wind regimes, curtailment patterns and the offset may differ in summer.
- National level only; portfolio-level exposure is not modelled.
- No demand or price data, so the buffer is sized in MW of wind, not in £ cost of being short or long.
- The cause of the offset is unconfirmed (section 3).
