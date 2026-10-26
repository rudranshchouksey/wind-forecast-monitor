# ADR 0005: Rolling linear bias correction on complete past days only

- Status: accepted (optional feature)
- Date: 2026-10-26

## Context
Most of the WINDFOR error against FUELHH is a persistent, level-dependent offset
([analysis §3](../analysis.md#3-is-the-bias-real-investigation)). Traders asked how much of the error
could be removed with a simple statistical correction, as long as it never uses information that was
unavailable at the decision.

## Decision
- For delivery day D, fit `actual ≈ a × forecast + b` by ordinary least squares on the cutoff-mode
  evaluation rows of the **7 complete delivery days D-8 … D-2**.
  - D-1 is excluded: at the D-1 09:20 cutoff it is only partly over.
  - D-2 ends at 00:00 on D-1, before any cutoff time on D-1, so the rule is safe for every
    configurable cutoff.
- Training rows use the forecasts selected at *their own* cutoffs, so the inputs are already leakage-free.
- At least 72 training hours are required, and a near-constant training forecast (std < 1 MW) gives no
  fit. Missing corrections are left empty, never filled.
- The correction is available in cutoff mode only. In horizon mode the information set would depend on
  the lead time, and that isn't modelled.
- Ingestion stores `correction_window_days + 1` extra days of history (default 8) before
  `delivery_from`, so the first January day can be corrected. History days are never part of the
  analysis range itself.

## Alternatives
- **Expanding window**: more data, but it adapts slowly if the offset drifts (for example with seasonal
  curtailment).
- **Mean-offset subtraction only**: simpler, but ignores that the offset grows with the forecast level.
- **Per-hour or per-level models**: likely better, but the sample is too small for one month and they are
  harder to explain to traders.

## Consequences
- January 2026: MAE 2,039 → **1,568 MW (−23 %)**, RMSE 2,505 → 2,017 MW (−19 %), bias +1,748 → +449 MW,
  31 of 31 days corrected.
- Proven leakage-free by perturbation tests (`tests/unit/test_correction.py`): changing every actual
  from D-1 onward and every forecast after D leaves D's correction bit-for-bit identical. A control
  test confirms the test would catch use of D-2.
- Shown as an optional dashed series with its own accuracy panel. The headline buffer is still computed on
  the raw forecast, because that is what the trader actually receives.
