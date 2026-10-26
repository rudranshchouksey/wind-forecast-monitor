"""Turn error statistics into a plain-language procurement takeaway.

``error = forecast - actual`` per hour, over all evaluated hours. Two bases for the buffer:

* ``total`` (default): buffer = P-th percentile of the error, floored at 0. Planning on
  ``forecast - buffer`` MW of wind would have covered actual (FUELHH) wind in P% of hours.
* ``random``: buffer = P-th percentile of the *de-biased* error ``error - mean(error)``, floored
  at 0. It covers P% of the hour-to-hour variation, assuming the persistent offset does not appear
  in the measure your position settles against. Its coverage against FUELHH as measured is
  reported alongside, because it is lower.

``worst_1pct_mw`` is the 99th percentile of the (raw) error over the same hours: in 1% of hours
wind fell short of the forecast by more than this.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt

BufferBasis = Literal["total", "random"]


@dataclass(frozen=True, slots=True)
class BufferInsight:
    percentile: float
    basis: BufferBasis
    n: int
    buffer_mw: float | None
    achieved_coverage: float | None
    coverage_vs_fuelhh: float | None
    offset_mw: float | None
    random_component_mw: float | None
    worst_1pct_mw: float | None
    headline: str
    detail: str
    caveat: str | None


OFFSET_CAVEAT_THRESHOLD_MW = 500.0
OFFSET_CAVEAT = (
    "Most of this buffer is a persistent offset: WINDFOR runs above FUELHH even for hours that "
    "had already happened when it was published. Elexon's documentation does not explain the "
    "gap (both cover operationally metered wind farms). Curtailment or a difference in farm "
    "coverage could cause it, but neither is confirmed. If your exposure is settled against a "
    "different measure of wind output, switch the buffer to 'Random error only'."
)
RANDOM_CAVEAT = (
    "This buffer leaves out the persistent offset between WINDFOR and FUELHH. Use it only if you "
    "have confirmed that the offset does not appear in the measure your position settles against; "
    "otherwise include the offset."
)


def buffer_recommendation(
    errors: npt.ArrayLike, percentile: float = 90.0, basis: BufferBasis = "total"
) -> BufferInsight:
    if not 0 < percentile < 100:
        raise ValueError("percentile must be between 0 and 100")
    e = np.asarray(errors, dtype=np.float64)
    if e.size == 0:
        return BufferInsight(
            percentile, basis, 0, None, None, None, None, None, None,
            "Not enough data to recommend a buffer.",
            "No hours had both a forecast and an actual in the selected range.",
            None,
        )  # fmt: skip
    offset = float(e.mean())
    debiased = e - offset
    random_part = max(0.0, float(np.percentile(debiased, percentile)))
    worst = max(0.0, float(np.percentile(e, 99)))
    if basis == "total":
        buffer = max(0.0, float(np.percentile(e, percentile)))
        achieved = float(np.mean(e <= buffer))
    else:
        buffer = random_part
        achieved = float(np.mean(debiased <= buffer))
    vs_fuelhh = float(np.mean(e <= buffer))
    direction = "above" if offset >= 0 else "below"
    shared = (
        f"Based on {e.size:,} hours. Forecasts were on average {abs(offset):,.0f} MW {direction} "
        f"actual output. In the worst 1% of hours the shortfall exceeded {worst:,.0f} MW."
    )
    if basis == "total":
        headline = (
            f"To cover wind under-delivery in {percentile:g}% of hours, plan on "
            f"{buffer:,.0f} MW less wind than the forecast."
        )
        detail = (
            f"{shared} About {max(offset, 0):,.0f} MW of the buffer is the persistent offset and "
            f"{random_part:,.0f} MW covers hour-to-hour variation. Applied to this period, the "
            f"buffer covered {achieved:.0%} of hours."
        )
        caveat = OFFSET_CAVEAT if offset >= OFFSET_CAVEAT_THRESHOLD_MW else None
    else:
        headline = (
            f"Excluding the systematic offset, plan on {buffer:,.0f} MW less wind than the "
            f"forecast to cover {percentile:g}% of hours of random variation."
        )
        detail = (
            f"{shared} This buffer covers {achieved:.0%} of hours once the {offset:,.0f} MW mean "
            f"offset is removed. Measured against FUELHH as published, it would have covered "
            f"only {vs_fuelhh:.0%} of hours."
        )
        caveat = RANDOM_CAVEAT if abs(offset) >= OFFSET_CAVEAT_THRESHOLD_MW else None
    return BufferInsight(
        percentile=percentile,
        basis=basis,
        n=int(e.size),
        buffer_mw=buffer,
        achieved_coverage=achieved,
        coverage_vs_fuelhh=vs_fuelhh,
        offset_mw=offset,
        random_component_mw=random_part,
        worst_1pct_mw=worst,
        headline=headline,
        detail=detail,
        caveat=caveat,
    )
