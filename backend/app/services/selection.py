"""Forecast selection: which forecast would a trader actually have had?

Two rules, both strict about look-ahead (a forecast published later than allowed is never used):

* **Cutoff mode**: for target T on delivery day D (Europe/London), use the forecast with the
  greatest ``publish_time <= cutoff(D)``, where ``cutoff(D) = D-1 at cutoff_time (London)``.
* **Horizon mode**: use the forecast with the greatest ``publish_time <= T - h``.

In both modes ``publish_time <= T`` also holds, so WINDFOR's past-dated points (rows that describe
hours already over when published) can never be selected.

Input frame columns: ``publish_time``, ``start_time`` (tz-aware UTC), ``generation_mw``.
Output frame columns: ``target_time``, ``forecast_mw``, ``publish_time``, ``decision_time``
(the latest publish time allowed for that target) and ``horizon_h`` (target minus publish, hours).
"""

from __future__ import annotations

from datetime import time
from zoneinfo import ZoneInfo

import pandas as pd

from app.core.timeutils import LONDON, decision_cutoff

SELECTED_COLUMNS = ["target_time", "forecast_mw", "publish_time", "decision_time", "horizon_h"]


def empty_selection() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "target_time": pd.Series(dtype="datetime64[ns, UTC]"),
            "forecast_mw": pd.Series(dtype="float64"),
            "publish_time": pd.Series(dtype="datetime64[ns, UTC]"),
            "decision_time": pd.Series(dtype="datetime64[ns, UTC]"),
            "horizon_h": pd.Series(dtype="float64"),
        }
    )


def cutoff_per_target(
    start_times: pd.Series, cutoff_time: time, tz: ZoneInfo = LONDON
) -> pd.Series:
    """Decision cutoff (UTC) for each target, based on the target's local delivery day."""
    days = start_times.dt.tz_convert(tz).dt.date
    lookup = {d: decision_cutoff(d, cutoff_time, tz) for d in days.unique()}
    cutoffs: pd.Series = pd.to_datetime(days.map(lookup), utc=True)
    return cutoffs


def select_at_cutoff(
    forecasts: pd.DataFrame, cutoff_time: time, tz: ZoneInfo = LONDON
) -> pd.DataFrame:
    """Latest forecast available at the day-ahead decision cutoff, one row per target."""
    if forecasts.empty:
        return empty_selection()
    decision_time = cutoff_per_target(forecasts["start_time"], cutoff_time, tz)
    return _latest_per_target(forecasts, decision_time)


def select_at_horizon(forecasts: pd.DataFrame, horizon_h: float) -> pd.DataFrame:
    """Latest forecast published at least ``horizon_h`` hours before each target."""
    if horizon_h < 0:
        raise ValueError("horizon_h must be >= 0")
    if forecasts.empty:
        return empty_selection()
    decision_time = forecasts["start_time"] - pd.Timedelta(hours=horizon_h)
    return _latest_per_target(forecasts, decision_time)


def _latest_per_target(forecasts: pd.DataFrame, decision_time: pd.Series) -> pd.DataFrame:
    eligible_mask = (forecasts["publish_time"] <= decision_time) & (
        forecasts["publish_time"] <= forecasts["start_time"]
    )
    eligible = forecasts.loc[eligible_mask].assign(decision_time=decision_time[eligible_mask])
    if eligible.empty:
        return empty_selection()
    # Sort so the last row per target is the latest publish; this is deterministic even if an
    # upstream bug ever produced equal publish times.
    eligible = eligible.sort_values(["start_time", "publish_time"], kind="stable")
    latest = eligible.groupby("start_time", sort=True).tail(1)
    out = pd.DataFrame(
        {
            "target_time": latest["start_time"],
            "forecast_mw": latest["generation_mw"].astype("float64"),
            "publish_time": latest["publish_time"],
            "decision_time": latest["decision_time"],
            "horizon_h": (latest["start_time"] - latest["publish_time"]).dt.total_seconds() / 3600,
        }
    )
    return out.reset_index(drop=True)
