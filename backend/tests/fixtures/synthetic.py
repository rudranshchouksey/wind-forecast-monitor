"""Deterministic synthetic dataset shaped like the real one.

* Actuals: half-hourly, ``actual(t) = 8000 + 100 * (t.hour)`` MW. Both half-hours of an hour share
  a value, so the hour-mean equals that value.
* Forecasts: published 8 times a day at the real WINDFOR times. Each covers 21:00 the day before
  publish plus 72 h, with ``forecast = actual(t) + BIAS + SLOPE * horizon_h``. The error at any
  target is therefore exactly ``BIAS + SLOPE * horizon_h``, which makes expected metrics easy to
  derive in tests.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.timeutils import delivery_range_bounds
from app.models.records import ActualRecord, ForecastRecord
from app.repositories.sqlite import WindRepository
from tests.conftest import utc

BIAS = 500.0
SLOPE = 10.0
PUBLISH_TIMES = ((2, 30), (4, 30), (7, 30), (9, 30), (11, 30), (15, 30), (18, 30), (22, 30))


def actual_at(t: datetime) -> float:
    return 8000.0 + 100.0 * t.hour


def build(repo: WindRepository, first: date, last: date) -> None:
    start, end = delivery_range_bounds(first, last)
    actuals = []
    t = start
    while t < end:
        actuals.append(ActualRecord(t, actual_at(t), t + timedelta(minutes=30)))
        t += timedelta(minutes=30)
    forecasts = []
    day = first - timedelta(days=4)
    while day <= last:
        for h, m in PUBLISH_TIMES:
            p = utc(day.year, day.month, day.day, h, m)
            window_start = utc(day.year, day.month, day.day) - timedelta(hours=3)
            for k in range(73):
                target = window_start + timedelta(hours=k)
                horizon = (target - p).total_seconds() / 3600
                forecasts.append(
                    ForecastRecord(p, target, actual_at(target) + BIAS + SLOPE * horizon)
                )
        day += timedelta(days=1)
    repo.upsert_actuals(actuals)
    repo.upsert_forecasts(forecasts)
