"""Diagnostics for the forecast bias, using only WINDFOR and FUELHH.

The key test: WINDFOR publishes values for hours that had already *ended* when it was published
(negative horizon). Those values are never used as forecasts, but comparing them with FUELHH
shows whether the gap between the two series persists once weather uncertainty is gone. If it
does, the gap is systematic (definition or coverage) rather than forecast skill.

Grouping errors by *forecast* level alone overstates the bias in the top bucket (hours picked for a
high forecast are enriched for over-forecasts: regression to the mean). So the level breakdown is
also reported for the hindcast rows, which carry almost no weather error, and by *actual* level.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Literal

import pandas as pd

LEVEL_EDGES_MW: tuple[float, ...] = (0, 5000, 10000, 15000, 30000)


@dataclass(frozen=True, slots=True)
class BiasBucket:
    label: str
    n: int
    bias_mw: float | None
    mean_ratio: float | None


def _bucket(label: str, forecast: pd.Series, actual: pd.Series) -> BiasBucket:
    if forecast.empty:
        return BiasBucket(label, 0, None, None)
    ratio = (actual / forecast).where(forecast > 0)
    return BiasBucket(
        label,
        int(forecast.size),
        float((forecast - actual).mean()),
        float(ratio.mean()) if ratio.notna().any() else None,
    )


def hindcast_rows(
    forecasts: pd.DataFrame, actual_hourly: pd.Series, max_age_h: float = 3.0
) -> pd.DataFrame:
    """WINDFOR rows for hours that ended at most ``max_age_h`` before publish, joined to actuals.

    Columns: ``forecast_mw``, ``actual_mw``.
    """
    age = (forecasts["publish_time"] - forecasts["start_time"]).dt.total_seconds() / 3600
    past = forecasts.loc[(age > 0) & (age <= max_age_h)]
    joined = past.join(actual_hourly, on="start_time", how="inner")
    return pd.DataFrame(
        {
            "forecast_mw": joined["generation_mw"].astype("float64"),
            "actual_mw": joined["actual_mw"],
        }
    )


def hindcast_bias(
    forecasts: pd.DataFrame, actual_hourly: pd.Series, max_age_h: float = 3.0
) -> BiasBucket:
    rows = hindcast_rows(forecasts, actual_hourly, max_age_h)
    return _bucket(
        f"hours already ended (0-{max_age_h:g} h before publish)",
        rows["forecast_mw"],
        rows["actual_mw"],
    )


def bias_by_level(
    frame: pd.DataFrame,
    by: Literal["forecast", "actual"] = "forecast",
    edges_mw: tuple[float, ...] = LEVEL_EDGES_MW,
) -> list[BiasBucket]:
    """Bias grouped by forecast or actual MW level (frame needs forecast_mw and actual_mw)."""
    level = frame[f"{by}_mw"]
    out: list[BiasBucket] = []
    for lo, hi in itertools.pairwise(edges_mw):
        sub = frame.loc[(level > lo) & (level <= hi)]
        out.append(_bucket(f"{lo / 1000:g}-{hi / 1000:g} GW", sub["forecast_mw"], sub["actual_mw"]))
    return out
