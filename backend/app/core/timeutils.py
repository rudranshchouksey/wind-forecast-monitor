"""Time helpers. Everything is stored and computed in UTC; delivery days are London calendar days.

The GB market's delivery day is a *local* day, so a day can be 23 or 25 hours long across clock
changes. All conversions go through ``zoneinfo`` so DST is handled exactly.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")


def ensure_utc(dt: datetime) -> datetime:
    """Return ``dt`` as an aware UTC datetime. Naive datetimes are rejected, never guessed."""
    if dt.tzinfo is None:
        raise ValueError(f"naive datetime not allowed: {dt!r}")
    return dt.astimezone(UTC)


def parse_utc(value: str) -> datetime:
    """Parse an ISO-8601 timestamp (``Z`` or offset) into aware UTC."""
    return ensure_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))


def format_utc(dt: datetime) -> str:
    return ensure_utc(dt).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_midnight_utc(day: date, tz: ZoneInfo = LONDON) -> datetime:
    return datetime.combine(day, time(0, 0), tzinfo=tz).astimezone(UTC)


def delivery_day_bounds(day: date, tz: ZoneInfo = LONDON) -> tuple[datetime, datetime]:
    """UTC half-open interval ``[start, end)`` covering the local delivery day."""
    return local_midnight_utc(day, tz), local_midnight_utc(day + timedelta(days=1), tz)


def delivery_range_bounds(
    first: date, last: date, tz: ZoneInfo = LONDON
) -> tuple[datetime, datetime]:
    """UTC ``[start, end)`` covering delivery days ``first..last`` inclusive."""
    return local_midnight_utc(first, tz), local_midnight_utc(last + timedelta(days=1), tz)


def delivery_day_of(target: datetime, tz: ZoneInfo = LONDON) -> date:
    """Local calendar date that a UTC instant belongs to."""
    return ensure_utc(target).astimezone(tz).date()


def decision_cutoff(day: date, cutoff_time: time, tz: ZoneInfo = LONDON) -> datetime:
    """Decision cutoff for delivery day ``day``: ``day - 1`` at ``cutoff_time`` local, as UTC."""
    return datetime.combine(day - timedelta(days=1), cutoff_time, tzinfo=tz).astimezone(UTC)
