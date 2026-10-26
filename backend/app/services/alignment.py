"""Align half-hourly actuals to the hourly forecast grid (see docs/adr/0004)."""

from __future__ import annotations

import pandas as pd

from app.core.config import Alignment


def hourly_actuals(actuals: pd.DataFrame, method: Alignment = "hour_mean") -> pd.Series:
    """Actual MW per forecast hour, indexed by the hour's UTC start time.

    * ``hour_mean``: mean of the half-hours starting at T and T+30min. Both must be present,
      otherwise the hour is dropped and never padded.
    * ``point``: the half-hour that starts exactly at T.
    """
    if actuals.empty:
        return pd.Series(dtype="float64", name="actual_mw", index=pd.DatetimeIndex([], tz="UTC"))
    start = actuals["start_time"]
    if method == "point":
        on_hour = actuals.loc[(start.dt.minute == 0) & (start.dt.second == 0)]
        series = on_hour.set_index("start_time")["generation_mw"]
    else:
        hour = start.dt.floor("h")
        grouped = actuals.groupby(hour)["generation_mw"].agg(["mean", "count"])
        series = grouped.loc[grouped["count"] == 2, "mean"]
    series = pd.Series(series.astype("float64").sort_index())
    series.index.name = "target_time"
    result: pd.Series = series.rename("actual_mw")
    return result
