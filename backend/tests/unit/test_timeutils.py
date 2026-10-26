from __future__ import annotations

from datetime import date, datetime, time

import pytest

from app.core.timeutils import (
    decision_cutoff,
    delivery_day_bounds,
    delivery_day_of,
    ensure_utc,
    format_utc,
    parse_utc,
)
from tests.conftest import utc


def test_cutoff_winter_and_summer() -> None:
    assert decision_cutoff(date(2026, 1, 10), time(9, 20)) == utc(2026, 1, 9, 9, 20)
    assert decision_cutoff(date(2026, 7, 10), time(9, 20)) == utc(2026, 7, 9, 8, 20)


def test_delivery_day_lengths_across_dst() -> None:
    for day, hours in [(date(2026, 1, 10), 24), (date(2026, 3, 29), 23), (date(2026, 10, 25), 25)]:
        start, end = delivery_day_bounds(day)
        assert (end - start).total_seconds() == hours * 3600


def test_delivery_day_of_uses_london_calendar() -> None:
    assert delivery_day_of(utc(2026, 7, 9, 23, 30)) == date(2026, 7, 10)  # 00:30 BST
    assert delivery_day_of(utc(2026, 1, 9, 23, 30)) == date(2026, 1, 9)


def test_parse_and_format_round_trip() -> None:
    assert parse_utc("2026-01-01T09:30:00Z") == utc(2026, 1, 1, 9, 30)
    assert parse_utc("2026-07-01T10:30:00+01:00") == utc(2026, 7, 1, 9, 30)
    assert format_utc(utc(2026, 1, 1, 9, 30)) == "2026-01-01T09:30:00Z"


def test_naive_datetimes_rejected() -> None:
    with pytest.raises(ValueError, match="naive"):
        ensure_utc(datetime(2026, 1, 1))
