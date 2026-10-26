"""Convert service-layer results into API schemas."""

from __future__ import annotations

from app.models import api
from app.services.analysis import AnalysisQuery
from app.services.analysis import Coverage as CoverageResult


def query_echo(q: AnalysisQuery) -> api.QueryEcho:
    return api.QueryEcho(
        first_day=q.first_day,
        last_day=q.last_day,
        mode=q.mode,
        cutoff_time=q.cutoff_time.strftime("%H:%M"),
        horizon_h=q.horizon_h if q.mode == "horizon" else None,
    )


def coverage(c: CoverageResult) -> api.Coverage:
    return api.Coverage(
        expected_hours=c.expected_hours,
        with_forecast=c.with_forecast,
        with_actual=c.with_actual,
        evaluated=c.evaluated,
        ratio=c.ratio,
    )
