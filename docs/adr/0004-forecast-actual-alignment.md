# ADR 0004: Evaluate on the hourly forecast grid, actual = mean of the hour's two half-hours

- Status: accepted
- Date: 2026-10-26

## Context
WINDFOR is hourly (`startTime` on the hour, 73 points per publish). FUELHH is half-hourly. Errors
need a common grid.

## Options
1. **Hour mean (chosen)**: actual(T) = mean(FUELHH[T], FUELHH[T+30m]); both halves must exist.
2. **Point match**: actual(T) = FUELHH[T] only; half the actuals go unused.
3. **Interpolate forecasts to 30 min**: creates forecast values nobody published.

## Decision
Option 1. Averaging MW over the two half-hours is the energy-equivalent average for the hour,
which is what an hourly day-ahead position is exposed to. It also never invents a forecast value.
Incomplete hours are dropped, never padded, and show up in each response's `coverage` block.
Option 2 remains available as `APP_ALIGNMENT=point` for sensitivity checks.

## Evidence (January 2026, 744 hours, 11:00 cutoff)
| Strategy | MAE | RMSE | Bias |
|---|---|---|---|
| hour mean | 2,013 MW | 2,506 MW | +1,730 MW |
| point match | 1,996 MW | 2,499 MW | +1,728 MW |

The difference is below 1 %, so the conclusions do not depend on this choice.
