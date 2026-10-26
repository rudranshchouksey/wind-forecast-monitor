"""Error metrics.

Sign convention used everywhere: ``error = forecast - actual`` (MW).

* ``error > 0`` is a **shortfall**: wind delivered less than forecast, so the buyer is short and
  must buy more. This is the procurement risk ("wind under-delivery" in the brief).
* ``error < 0`` is a **surplus**: more wind than forecast.

Percentiles use linear interpolation (NumPy's default, the same as Excel ``PERCENTILE.INC``).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True, slots=True)
class DirectionalStats:
    """Magnitude statistics over the hours that erred in one direction."""

    n: int
    share: float | None
    mean_mw: float | None
    p50_mw: float | None
    p90_mw: float | None
    p99_mw: float | None
    max_mw: float | None


@dataclass(frozen=True, slots=True)
class ErrorMetrics:
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    mape_pct: float | None
    mape_n: int
    mape_min_actual_mw: float
    abs_p50_mw: float | None
    abs_p90_mw: float | None
    abs_p99_mw: float | None
    shortfall: DirectionalStats
    surplus: DirectionalStats


def _pct(values: FloatArray, q: float) -> float:
    return float(np.percentile(values, q))


def directional_stats(magnitudes: FloatArray, total: int) -> DirectionalStats:
    n = int(magnitudes.size)
    if n == 0:
        return DirectionalStats(0, 0.0 if total else None, None, None, None, None, None)
    return DirectionalStats(
        n=n,
        share=n / total,
        mean_mw=float(magnitudes.mean()),
        p50_mw=_pct(magnitudes, 50),
        p90_mw=_pct(magnitudes, 90),
        p99_mw=_pct(magnitudes, 99),
        max_mw=float(magnitudes.max()),
    )


def compute_metrics(
    forecast: npt.ArrayLike, actual: npt.ArrayLike, *, mape_min_actual_mw: float = 1000.0
) -> ErrorMetrics:
    f = np.asarray(forecast, dtype=np.float64)
    a = np.asarray(actual, dtype=np.float64)
    if f.shape != a.shape:
        raise ValueError("forecast and actual must have the same shape")
    if not (np.isfinite(f).all() and np.isfinite(a).all()):
        raise ValueError("forecast and actual must be finite; drop missing values first")
    err = f - a
    n = int(err.size)
    mape_mask = a >= mape_min_actual_mw
    mape_n = int(mape_mask.sum())
    if n == 0:
        empty = directional_stats(np.empty(0), 0)
        return ErrorMetrics(
            0, None, None, None, None, 0, mape_min_actual_mw, None, None, None, empty, empty
        )
    abs_err = np.abs(err)
    return ErrorMetrics(
        n=n,
        mae_mw=float(abs_err.mean()),
        rmse_mw=float(np.sqrt(np.mean(err**2))),
        bias_mw=float(err.mean()),
        mape_pct=float(np.mean(abs_err[mape_mask] / a[mape_mask]) * 100) if mape_n else None,
        mape_n=mape_n,
        mape_min_actual_mw=mape_min_actual_mw,
        abs_p50_mw=_pct(abs_err, 50),
        abs_p90_mw=_pct(abs_err, 90),
        abs_p99_mw=_pct(abs_err, 99),
        shortfall=directional_stats(err[err > 0], n),
        surplus=directional_stats(-err[err < 0], n),
    )


@dataclass(frozen=True, slots=True)
class Histogram:
    bin_width_mw: float
    edges: list[float]
    counts: list[int]


def histogram(errors: npt.ArrayLike, bin_width_mw: float) -> Histogram:
    """Fixed-width bins aligned to multiples of ``bin_width_mw`` (so 0 is always an edge)."""
    if bin_width_mw <= 0:
        raise ValueError("bin_width_mw must be positive")
    e = np.asarray(errors, dtype=np.float64)
    if e.size == 0:
        return Histogram(bin_width_mw, [], [])
    lo = np.floor(e.min() / bin_width_mw) * bin_width_mw
    hi = np.ceil(e.max() / bin_width_mw) * bin_width_mw
    if hi <= lo:
        hi = lo + bin_width_mw
    edges = np.arange(lo, hi + bin_width_mw / 2, bin_width_mw)
    counts, _ = np.histogram(e, bins=edges)
    return Histogram(bin_width_mw, [float(x) for x in edges], [int(c) for c in counts])
