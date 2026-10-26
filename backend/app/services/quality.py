"""Data-quality checks run on every ingest. Problems are reported, never silently patched."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from app.core.timeutils import LONDON, delivery_range_bounds, format_utc
from app.models.records import ActualRecord, ForecastRecord

HALF_HOUR = timedelta(minutes=30)


@dataclass(frozen=True, slots=True)
class QualityReport:
    actual_duplicates: int
    forecast_duplicates: int
    missing_actual_periods: list[str]
    non_half_hour_actuals: int
    publishes: int
    publishes_per_day: dict[str, int]
    irregular_publish_times: list[str] = field(default_factory=list)
    past_dated_forecast_rows: int = 0

    def lines(self) -> list[str]:
        missing = self.missing_actual_periods
        low_days = {d: n for d, n in self.publishes_per_day.items() if n < 8}
        return [
            f"duplicate actual rows (resolved, latest publish wins): {self.actual_duplicates}",
            f"duplicate forecast rows (resolved): {self.forecast_duplicates}",
            f"missing half-hourly actual periods: {len(missing)}"
            + (f" e.g. {missing[:5]}" if missing else ""),
            f"actuals not on a :00/:30 boundary: {self.non_half_hour_actuals}",
            f"forecast publishes: {self.publishes}; days with <8 publishes: {low_days or 'none'}",
            f"publishes off the usual :30 schedule: {self.irregular_publish_times or 'none'}",
            f"forecast rows dated before their publish time (never selectable): "
            f"{self.past_dated_forecast_rows}",
        ]


def dedupe_actuals(records: Sequence[ActualRecord]) -> tuple[list[ActualRecord], int]:
    """Keep one row per start_time: the one published last."""
    best: dict[datetime, ActualRecord] = {}
    for r in records:
        cur = best.get(r.start_time)
        if cur is None or r.publish_time > cur.publish_time:
            best[r.start_time] = r
    return sorted(best.values(), key=lambda r: r.start_time), len(records) - len(best)


def dedupe_forecasts(records: Sequence[ForecastRecord]) -> tuple[list[ForecastRecord], int]:
    """Keep one row per (publish_time, start_time); later rows in the input win."""
    best: dict[tuple[datetime, datetime], ForecastRecord] = {}
    for r in records:
        best[(r.publish_time, r.start_time)] = r
    ordered = sorted(best.values(), key=lambda r: (r.publish_time, r.start_time))
    return ordered, len(records) - len(best)


def build_report(
    actuals: Sequence[ActualRecord],
    forecasts: Sequence[ForecastRecord],
    first_day: date,
    last_day: date,
    *,
    actual_duplicates: int,
    forecast_duplicates: int,
) -> QualityReport:
    start, end = delivery_range_bounds(first_day, last_day)
    present = {r.start_time for r in actuals}
    missing: list[str] = []
    t = start
    while t < end:
        if t not in present:
            missing.append(format_utc(t))
        t += HALF_HOUR
    off_grid = sum(1 for r in actuals if r.start_time.minute % 30 or r.start_time.second)

    publish_times = sorted({r.publish_time for r in forecasts})
    # Only decision days (D-1 for each delivery day) are checked for a full publish schedule;
    # earlier days exist only for long-horizon analysis and are partially covered by design.
    decision_days = {
        first_day + timedelta(days=i - 1) for i in range((last_day - first_day).days + 1)
    }
    counts = Counter(p.astimezone(LONDON).date() for p in publish_times)
    per_day = {d.isoformat(): counts.get(d, 0) for d in decision_days}
    irregular = [format_utc(p) for p in publish_times if p.minute != 30]
    past_dated = sum(1 for r in forecasts if r.start_time < r.publish_time)
    return QualityReport(
        actual_duplicates=actual_duplicates,
        forecast_duplicates=forecast_duplicates,
        missing_actual_periods=missing,
        non_half_hour_actuals=off_grid,
        publishes=len(publish_times),
        publishes_per_day=dict(sorted(per_day.items())),
        irregular_publish_times=irregular,
        past_dated_forecast_rows=past_dated,
    )
