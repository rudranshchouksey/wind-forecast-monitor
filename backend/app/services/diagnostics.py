"""Diagnostics for the forecast bias, using only WINDFOR and FUELHH.

The key test: WINDFOR publishes values for hours that had already *ended* when it was published
(negative horizon). Those values are never used as forecasts, but comparing them with FUELHH
shows whether the gap between the two series persists once weather uncertainty is gone. If it
does, the gap is systematic (definition or coverage) rather than forecast skill.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import pandas as pd


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


def hindcast_bias(
    forecasts: pd.DataFrame, actual_hourly: pd.Series, max_age_h: float = 3.0
) -> BiasBucket:
    """Bias of WINDFOR rows describing hours that ended at most ``max_age_h`` before publish."""
    age = (forecasts["publish_time"] - forecasts["start_time"]).dt.total_seconds() / 3600
    past = forecasts.loc[(age > 0) & (age <= max_age_h)]
    joined = past.join(actual_hourly, on="start_time", how="inner")
    return _bucket(
        f"hours already ended (0-{max_age_h:g} h before publish)",
        joined["generation_mw"].astype("float64"),
        joined["actual_mw"],
    )


def bias_by_forecast_level(
    evaluation: pd.DataFrame, edges_mw: tuple[float, ...] = (0, 5000, 10000, 15000, 30000)
) -> list[BiasBucket]:
    """Bias grouped by forecast MW level (evaluation needs forecast_mw and actual_mw)."""
    out: list[BiasBucket] = []
    for lo, hi in itertools.pairwise(edges_mw):
        mask = (evaluation["forecast_mw"] > lo) & (evaluation["forecast_mw"] <= hi)
        sub = evaluation.loc[mask]
        out.append(_bucket(f"{lo / 1000:g}-{hi / 1000:g} GW", sub["forecast_mw"], sub["actual_mw"]))
    return out
