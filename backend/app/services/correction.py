"""Rolling linear bias correction, using only information available at the decision cutoff.

For delivery day D the decision is made at D-1 09:20 (London). At that moment the last *complete*
delivery day with published actuals is D-2, so the correction for D is fitted on days
``D-1-window .. D-2`` (7 complete days by default):

    actual ≈ a · forecast + b      (ordinary least squares on the cutoff-selected forecasts)
    corrected(D) = a · forecast(D) + b

Training rows are themselves leakage-free (each used the forecast available at *its own* cutoff),
and no actual from D-1 or later is ever used. A day without ``min_hours`` of history gets no
corrected value; it is never filled with a fit that sees the future.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import numpy.typing as npt
import pandas as pd

from app.core.timeutils import LONDON

DEFAULT_WINDOW_DAYS = 7
DEFAULT_MIN_HOURS = 72
MIN_FORECAST_STD_MW = 1.0  # a flat training forecast cannot identify a slope


@dataclass(frozen=True, slots=True)
class DailyFit:
    day: date
    slope: float
    intercept: float
    train_hours: int
    train_first_day: date
    train_last_day: date


def training_days(day: date, window_days: int) -> tuple[date, date]:
    """Inclusive range of complete delivery days known at the D-1 cutoff for ``day``."""
    return day - timedelta(days=window_days + 1), day - timedelta(days=2)


def fit_line(x: npt.NDArray[np.float64], y: npt.NDArray[np.float64]) -> tuple[float, float] | None:
    """Closed-form OLS ``y = slope * x + intercept``; None when ``x`` is (near) constant."""
    if x.std() < MIN_FORECAST_STD_MW:
        return None
    x_mean, y_mean = x.mean(), y.mean()
    slope = float(np.sum((x - x_mean) * (y - y_mean)) / np.sum((x - x_mean) ** 2))
    return slope, float(y_mean - slope * x_mean)


def rolling_linear_correction(
    frame: pd.DataFrame,
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    min_hours: int = DEFAULT_MIN_HOURS,
    tz: ZoneInfo = LONDON,
) -> tuple[pd.DataFrame, list[DailyFit]]:
    """Add ``corrected_mw`` to a cutoff-mode evaluation frame.

    ``frame`` needs ``target_time`` (UTC), ``forecast_mw`` and ``actual_mw``. It should include the
    history days before the period of interest. Returns the frame with ``corrected_mw`` (NaN where
    there is not enough history, or the training forecasts are flat) plus the per-day fits.
    """
    if window_days < 1:
        raise ValueError("window_days must be >= 1")
    out = frame.copy()
    out["corrected_mw"] = np.nan
    if out.empty:
        return out, []
    days = out["target_time"].dt.tz_convert(tz).dt.date
    fits: list[DailyFit] = []
    for day in sorted(days.unique()):
        first, last = training_days(day, window_days)
        train = out.loc[(days >= first) & (days <= last)]
        if len(train) < min_hours:
            continue
        line = fit_line(
            train["forecast_mw"].to_numpy(dtype=np.float64),
            train["actual_mw"].to_numpy(dtype=np.float64),
        )
        if line is None:
            continue
        slope, intercept = line
        mask = days == day
        out.loc[mask, "corrected_mw"] = slope * out.loc[mask, "forecast_mw"] + intercept
        fits.append(DailyFit(day, slope, intercept, len(train), first, last))
    return out, fits
