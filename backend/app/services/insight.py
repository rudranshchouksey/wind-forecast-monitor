"""Turn error statistics into a plain-language procurement takeaway.

Buffer at percentile p: the p-th percentile of ``error = forecast - actual``, clipped at 0.
Planning on ``forecast - buffer`` MW of wind would have covered actual wind in p% of hours.
The buffer is split into a persistent offset (the mean error) and the random part above it,
because the two call for different responses (see docs/analysis.md, "Is the bias real?").
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt


@dataclass(frozen=True, slots=True)
class BufferInsight:
    percentile: float
    n: int
    buffer_mw: float | None
    achieved_coverage: float | None
    offset_mw: float | None
    random_component_mw: float | None
    headline: str
    detail: str
    caveat: str | None


OFFSET_CAVEAT_THRESHOLD_MW = 500.0
OFFSET_CAVEAT = (
    "Most of this buffer is a persistent offset: WINDFOR runs above FUELHH even for hours that "
    "had already happened when it was published. Elexon's documentation does not explain the "
    "gap (both cover operationally metered wind farms). Curtailment or a difference in farm "
    "coverage could cause it, but neither is confirmed. If your exposure is settled against a "
    "different measure of wind output, size the buffer from the random component instead."
)


def buffer_recommendation(errors: npt.ArrayLike, percentile: float = 90.0) -> BufferInsight:
    if not 0 < percentile < 100:
        raise ValueError("percentile must be between 0 and 100")
    e = np.asarray(errors, dtype=np.float64)
    if e.size == 0:
        return BufferInsight(
            percentile,
            0,
            None,
            None,
            None,
            None,
            "Not enough data to recommend a buffer.",
            "No hours had both a forecast and an actual in the selected range.",
            None,
        )
    raw = float(np.percentile(e, percentile))
    buffer = max(0.0, raw)
    offset = float(e.mean())
    random_part = max(0.0, float(np.percentile(e - offset, percentile)))
    coverage = float(np.mean(e <= buffer))
    p99 = float(np.percentile(e, 99))
    direction = "above" if offset >= 0 else "below"
    headline = (
        f"To cover wind under-delivery in {percentile:g}% of hours, plan on "
        f"{buffer:,.0f} MW less wind than the forecast."
    )
    detail = (
        f"Based on {e.size:,} hours. Forecasts were on average {abs(offset):,.0f} MW {direction} "
        f"actual output; about {max(offset, 0):,.0f} MW of the buffer is that persistent offset "
        f"and {random_part:,.0f} MW covers hour-to-hour variation. In the worst 1% of hours the "
        f"shortfall exceeded {max(p99, 0):,.0f} MW. Applied to this period, the buffer covered "
        f"{coverage:.0%} of hours."
    )
    caveat = OFFSET_CAVEAT if offset >= OFFSET_CAVEAT_THRESHOLD_MW else None
    return BufferInsight(
        percentile, int(e.size), buffer, coverage, offset, random_part, headline, detail, caveat
    )
