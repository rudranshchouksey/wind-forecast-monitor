"""Analysis service: selection + alignment + metrics, over the cached dataset.

The whole January dataset is about 25k rows, so it is loaded into memory once and every query is
evaluated from that copy. Evaluations are memoised per query, and ``reload()`` drops everything
after a refresh.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, time
from typing import Literal

import numpy as np
import pandas as pd

from app.core.config import Settings
from app.core.timeutils import LONDON, delivery_range_bounds
from app.repositories.sqlite import WindRepository
from app.services.alignment import hourly_actuals
from app.services.correction import DailyFit, rolling_linear_correction
from app.services.diagnostics import (
    BiasBucket,
    bias_by_level,
    hindcast_bias,
    hindcast_rows,
)
from app.services.insight import BufferBasis, BufferInsight, buffer_recommendation
from app.services.metrics import ErrorMetrics, Histogram, compute_metrics, histogram
from app.services.selection import select_at_cutoff, select_at_horizon

Mode = Literal["cutoff", "horizon"]
MAX_HORIZON_H = 72.0
DEFAULT_HORIZONS: tuple[float, ...] = (1, 2, 4, 8, 12, 16, 24, 36, 48)
EVALUATION_COLUMNS = [
    "target_time", "actual_mw", "forecast_mw", "error_mw", "publish_time", "decision_time",
    "horizon_h",
]  # fmt: skip


class DataUnavailableError(RuntimeError):
    """No data has been ingested (or the snapshot is missing)."""


class QueryError(ValueError):
    """The query is valid in shape but cannot be answered (e.g. outside the data range)."""


@dataclass(frozen=True, slots=True)
class AnalysisQuery:
    first_day: date
    last_day: date
    mode: Mode = "cutoff"
    cutoff_time: time = time(9, 20)
    horizon_h: float = 24.0


@dataclass(frozen=True, slots=True)
class Coverage:
    expected_hours: int
    with_forecast: int
    with_actual: int
    evaluated: int

    @property
    def ratio(self) -> float:
        return self.evaluated / self.expected_hours if self.expected_hours else 0.0


@dataclass(frozen=True, slots=True)
class Evaluation:
    query: AnalysisQuery
    frame: pd.DataFrame = field(repr=False)
    coverage: Coverage


@dataclass(frozen=True, slots=True)
class MetricsResult:
    metrics: ErrorMetrics
    coverage: Coverage
    insight: BufferInsight
    mean_horizon_h: float | None


@dataclass(frozen=True, slots=True)
class GroupMetrics:
    key: str
    metrics: ErrorMetrics


@dataclass(frozen=True, slots=True)
class HorizonMetrics:
    horizon_h: float
    metrics: ErrorMetrics
    coverage: Coverage


@dataclass(frozen=True, slots=True)
class Distribution:
    histogram: Histogram
    quantiles: dict[str, float]
    n: int


@dataclass(frozen=True, slots=True)
class BiasDiagnostics:
    overall_bias_mw: float | None
    bias_at_zero_horizon_mw: float | None
    hindcast: BiasBucket
    by_forecast_level: list[BiasBucket]
    by_actual_level: list[BiasBucket]
    hindcast_by_level: list[BiasBucket]
    hindcast_by_actual_level: list[BiasBucket]


@dataclass(frozen=True, slots=True)
class CorrectionResult:
    window_days: int
    days_total: int
    days_corrected: int
    raw: ErrorMetrics
    corrected: ErrorMetrics
    latest_fit: DailyFit | None


@dataclass(frozen=True, slots=True)
class DataRange:
    first_day: date
    last_day: date


class AnalysisService:
    def __init__(self, repo: WindRepository, settings: Settings, cache_size: int = 256) -> None:
        self._repo = repo
        self._settings = settings
        self._cache_size = cache_size
        self._lock = threading.RLock()
        self._forecasts: pd.DataFrame | None = None
        self._actuals: pd.Series | None = None
        self._cache: OrderedDict[AnalysisQuery, Evaluation] = OrderedDict()

    @property
    def data_range(self) -> DataRange:
        return DataRange(self._settings.delivery_from, self._settings.delivery_to)

    def reload(self) -> None:
        with self._lock:
            self._forecasts = None
            self._actuals = None
            self._cache.clear()

    def _load(self) -> tuple[pd.DataFrame, pd.Series]:
        with self._lock:
            if self._forecasts is None or self._actuals is None:
                if not self._repo.path.exists():
                    raise DataUnavailableError(f"database not found at {self._repo.path}")
                # History before delivery_from feeds the rolling bias correction only.
                start, end = delivery_range_bounds(
                    self._settings.history_from, self._settings.delivery_to
                )
                forecasts = self._repo.load_forecasts(start, end)
                actuals = hourly_actuals(
                    self._repo.load_actuals(start, end), self._settings.alignment
                )
                if forecasts.empty or actuals.empty:
                    raise DataUnavailableError("no data ingested; run `python -m app.ingest`")
                self._forecasts, self._actuals = forecasts, actuals
            return self._forecasts, self._actuals

    def validate(self, q: AnalysisQuery) -> None:
        r = self.data_range
        if q.last_day < q.first_day:
            raise QueryError("'to' must be on or after 'from'")
        if q.first_day < r.first_day or q.last_day > r.last_day:
            raise QueryError(f"dates must be within {r.first_day} .. {r.last_day}")
        if q.mode == "horizon" and not 0 <= q.horizon_h <= MAX_HORIZON_H:
            raise QueryError(f"horizon_h must be between 0 and {MAX_HORIZON_H:g}")

    # -- core evaluation ----------------------------------------------------------------------

    def evaluate(self, q: AnalysisQuery) -> Evaluation:
        self.validate(q)
        return self._cached(q)

    def _cached(self, q: AnalysisQuery) -> Evaluation:
        """Memoised evaluation without range validation (internal callers may use history days)."""
        with self._lock:
            hit = self._cache.get(q)
            if hit is not None:
                self._cache.move_to_end(q)
                return hit
        result = self._evaluate(q)
        with self._lock:
            self._cache[q] = result
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return result

    def _evaluate(self, q: AnalysisQuery) -> Evaluation:
        forecasts, actuals = self._load()
        start, end = delivery_range_bounds(q.first_day, q.last_day)
        in_range = forecasts.loc[
            (forecasts["start_time"] >= start) & (forecasts["start_time"] < end)
        ]
        selected = (
            select_at_cutoff(in_range, q.cutoff_time)
            if q.mode == "cutoff"
            else select_at_horizon(in_range, q.horizon_h)
        )
        targets = pd.date_range(start, end, freq="h", inclusive="left")
        actual_in_range = actuals.loc[(actuals.index >= start) & (actuals.index < end)]
        frame = selected.join(actual_in_range, on="target_time", how="inner")
        frame["error_mw"] = frame["forecast_mw"] - frame["actual_mw"]
        frame = frame[EVALUATION_COLUMNS].sort_values("target_time").reset_index(drop=True)
        coverage = Coverage(
            expected_hours=len(targets),
            with_forecast=len(selected),
            with_actual=len(actual_in_range),
            evaluated=len(frame),
        )
        return Evaluation(q, frame, coverage)

    def _metrics(self, frame: pd.DataFrame) -> ErrorMetrics:
        return compute_metrics(
            frame["forecast_mw"].to_numpy(),
            frame["actual_mw"].to_numpy(),
            mape_min_actual_mw=self._settings.mape_min_actual_mw,
        )

    # -- public views -------------------------------------------------------------------------

    def series(self, q: AnalysisQuery) -> pd.DataFrame:
        """Evaluation rows plus ``corrected_mw`` (cutoff mode only; NaN where unavailable)."""
        frame = self.evaluate(q).frame
        if q.mode != "cutoff":
            return frame.assign(corrected_mw=np.nan)
        corrected, _ = self._corrected(q)
        return frame.merge(corrected[["target_time", "corrected_mw"]], on="target_time", how="left")

    def metrics(
        self, q: AnalysisQuery, percentile: float, basis: BufferBasis = "total"
    ) -> MetricsResult:
        ev = self.evaluate(q)
        horizon = ev.frame["horizon_h"]
        return MetricsResult(
            metrics=self._metrics(ev.frame),
            coverage=ev.coverage,
            insight=buffer_recommendation(ev.frame["error_mw"].to_numpy(), percentile, basis),
            mean_horizon_h=float(horizon.mean()) if len(horizon) else None,
        )

    # -- bias correction ----------------------------------------------------------------------

    def _corrected(self, q: AnalysisQuery) -> tuple[pd.DataFrame, list[DailyFit]]:
        """Rolling correction over history + query range, restricted to the query's days."""
        history = self._cached(
            AnalysisQuery(self._settings.history_from, q.last_day, "cutoff", q.cutoff_time)
        )
        corrected, fits = rolling_linear_correction(
            history.frame, window_days=self._settings.correction_window_days
        )
        start, end = delivery_range_bounds(q.first_day, q.last_day)
        in_range = (corrected["target_time"] >= start) & (corrected["target_time"] < end)
        fits = [f for f in fits if q.first_day <= f.day <= q.last_day]
        return corrected.loc[in_range].reset_index(drop=True), fits

    def correction(self, q: AnalysisQuery) -> CorrectionResult:
        """Raw vs bias-corrected accuracy over the hours where a correction exists."""
        self.validate(q)
        if q.mode != "cutoff":
            raise QueryError("bias correction is only defined at the decision cutoff (mode=cutoff)")
        corrected, fits = self._corrected(q)
        common = corrected.dropna(subset=["corrected_mw"])
        raw = self._metrics(common)
        fixed = compute_metrics(
            common["corrected_mw"].to_numpy(),
            common["actual_mw"].to_numpy(),
            mape_min_actual_mw=self._settings.mape_min_actual_mw,
        )
        return CorrectionResult(
            window_days=self._settings.correction_window_days,
            days_total=(q.last_day - q.first_day).days + 1,
            days_corrected=len(fits),
            raw=raw,
            corrected=fixed,
            latest_fit=fits[-1] if fits else None,
        )

    def _grouped(
        self, q: AnalysisQuery, key: Callable[[pd.Series], pd.Series]
    ) -> list[GroupMetrics]:
        frame = self.evaluate(q).frame
        if frame.empty:
            return []
        keys = key(frame["target_time"].dt.tz_convert(LONDON))
        return [GroupMetrics(str(k), self._metrics(g)) for k, g in frame.groupby(keys, sort=True)]

    def by_hour(self, q: AnalysisQuery) -> list[GroupMetrics]:
        """Grouped by Europe/London hour of day of the target (0-23)."""
        return self._grouped(q, lambda t: t.dt.hour)

    def by_day(self, q: AnalysisQuery) -> list[GroupMetrics]:
        """Grouped by delivery day (Europe/London date, ISO string)."""
        return self._grouped(q, lambda t: t.dt.strftime("%Y-%m-%d"))

    def by_horizon(
        self, q: AnalysisQuery, horizons: Sequence[float] = DEFAULT_HORIZONS
    ) -> list[HorizonMetrics]:
        out = []
        for h in sorted(set(horizons)):
            ev = self.evaluate(
                AnalysisQuery(q.first_day, q.last_day, "horizon", q.cutoff_time, float(h))
            )
            out.append(HorizonMetrics(float(h), self._metrics(ev.frame), ev.coverage))
        return out

    def distribution(self, q: AnalysisQuery, bin_width_mw: float) -> Distribution:
        errors = self.evaluate(q).frame["error_mw"].to_numpy()
        qs: dict[str, float] = {}
        if errors.size:
            qs = {f"p{p}": float(np.percentile(errors, p)) for p in (1, 5, 10, 50, 90, 95, 99)}
        return Distribution(histogram(errors, bin_width_mw), qs, int(errors.size))

    def bias_diagnostics(self, q: AnalysisQuery) -> BiasDiagnostics:
        forecasts, actuals = self._load()
        frame = self.evaluate(q).frame
        start, end = delivery_range_bounds(q.first_day, q.last_day)
        window = forecasts.loc[(forecasts["start_time"] >= start) & (forecasts["start_time"] < end)]
        zero = self.evaluate(AnalysisQuery(q.first_day, q.last_day, "horizon", q.cutoff_time, 0.0))
        hindcast = hindcast_rows(window, actuals)
        return BiasDiagnostics(
            overall_bias_mw=float(frame["error_mw"].mean()) if len(frame) else None,
            bias_at_zero_horizon_mw=(
                float(zero.frame["error_mw"].mean()) if len(zero.frame) else None
            ),
            hindcast=hindcast_bias(window, actuals),
            by_forecast_level=bias_by_level(frame, "forecast"),
            by_actual_level=bias_by_level(frame, "actual"),
            hindcast_by_level=bias_by_level(hindcast, "forecast"),
            hindcast_by_actual_level=bias_by_level(hindcast, "actual"),
        )
