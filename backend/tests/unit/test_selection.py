"""Cutoff/horizon selection: the no-look-ahead guarantees.

Times in comments are UTC unless marked London. In January, London = UTC (GMT).
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from datetime import datetime, time, timedelta

import pandas as pd
import pytest

from app.core.timeutils import decision_cutoff, delivery_day_of
from app.services.selection import (
    SELECTED_COLUMNS,
    cutoff_per_target,
    select_at_cutoff,
    select_at_horizon,
)
from tests.conftest import utc

CUTOFF = time(9, 20)


def frame(rows: Sequence[tuple[datetime, datetime, float]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["publish_time", "start_time", "generation_mw"])
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    return df


def picked(sel: pd.DataFrame) -> dict[datetime, float]:
    return {
        t.to_pydatetime(): v for t, v in zip(sel["target_time"], sel["forecast_mw"], strict=True)
    }


# -- cutoff mode -------------------------------------------------------------------------------


def test_picks_latest_publish_at_or_before_cutoff() -> None:
    target = utc(2026, 1, 10, 12)
    sel = select_at_cutoff(
        frame(
            [
                (utc(2026, 1, 9, 2, 30), target, 100),
                (utc(2026, 1, 9, 7, 30), target, 200),  # latest eligible (cutoff 09:20)
                (utc(2026, 1, 9, 9, 30), target, 300),  # 10 min after cutoff -> leakage
                (utc(2026, 1, 9, 22, 30), target, 400),
            ]
        ),
        CUTOFF,
    )
    assert picked(sel) == {target: 200}
    row = sel.iloc[0]
    assert row["publish_time"] == pd.Timestamp(utc(2026, 1, 9, 7, 30))
    assert row["decision_time"] == pd.Timestamp(utc(2026, 1, 9, 9, 20))
    assert row["horizon_h"] == pytest.approx(28.5)
    assert list(sel.columns) == SELECTED_COLUMNS


def test_publish_exactly_at_cutoff_is_included_one_second_after_is_not() -> None:
    target = utc(2026, 1, 10, 6)
    at = utc(2026, 1, 9, 9, 20)
    rows = [(utc(2026, 1, 9, 4, 30), target, 1), (at, target, 2)]
    assert picked(select_at_cutoff(frame(rows), CUTOFF)) == {target: 2}
    rows_late = [(utc(2026, 1, 9, 4, 30), target, 1), (at + timedelta(seconds=1), target, 2)]
    assert picked(select_at_cutoff(frame(rows_late), CUTOFF)) == {target: 1}


def test_first_and_last_hour_of_day_share_the_previous_days_cutoff() -> None:
    first, last, next_day = utc(2026, 1, 10, 0), utc(2026, 1, 10, 23), utc(2026, 1, 11, 0)
    early, late = utc(2026, 1, 9, 7, 30), utc(2026, 1, 10, 7, 30)
    rows = [(p, t, v) for t in (first, last, next_day) for p, v in ((early, 1), (late, 2))]
    sel = picked(select_at_cutoff(frame(rows), CUTOFF))
    # 00:00 and 23:00 on D both use D-1 09:20, so the D 07:30 publish is look-ahead for both...
    assert sel[first] == 1
    assert sel[last] == 1
    # ...but 00:00 on D+1 belongs to the next delivery day, whose cutoff is D 09:20.
    assert sel[next_day] == 2


def test_target_without_eligible_forecast_is_omitted_not_filled() -> None:
    target = utc(2026, 1, 10, 3)
    sel = select_at_cutoff(frame([(utc(2026, 1, 9, 11, 30), target, 5)]), CUTOFF)
    assert sel.empty
    assert list(sel.columns) == SELECTED_COLUMNS


def test_irregular_publish_time_is_handled() -> None:
    # 2026-01-15: the 11:30 publish arrived at 12:25. With an 11:00 cutoff it must not be used.
    target = utc(2026, 1, 16, 12)
    rows = [(utc(2026, 1, 15, 9, 30), target, 1), (utc(2026, 1, 15, 12, 25), target, 2)]
    assert picked(select_at_cutoff(frame(rows), time(11, 0))) == {target: 1}
    assert picked(select_at_cutoff(frame(rows), time(13, 0))) == {target: 2}


def test_cutoff_is_configurable() -> None:
    target = utc(2026, 1, 10, 12)
    rows = [(utc(2026, 1, 9, 7, 30), target, 1), (utc(2026, 1, 9, 9, 30), target, 2)]
    assert picked(select_at_cutoff(frame(rows), time(9, 20))) == {target: 1}
    assert picked(select_at_cutoff(frame(rows), time(9, 50))) == {target: 2}
    assert picked(select_at_cutoff(frame(rows), time(11, 0))) == {target: 2}


def test_spring_forward_day_uses_local_cutoffs() -> None:
    # Clocks go forward 2026-03-29 01:00 GMT -> 02:00 BST (a 23-hour delivery day).
    # Target 2026-03-29 23:00 UTC is 00:00 BST on 2026-03-30, so its cutoff is
    # 2026-03-29 09:20 BST = 08:20 UTC, not 09:20 UTC.
    t_d = utc(2026, 3, 29, 12)  # delivery day 29 Mar, cutoff 28 Mar 09:20 GMT = 09:20 UTC
    t_next = utc(2026, 3, 29, 23)  # delivery day 30 Mar
    rows = [
        (utc(2026, 3, 28, 9, 15), t_d, 1),
        (utc(2026, 3, 28, 9, 25), t_d, 2),
        (utc(2026, 3, 29, 8, 15), t_next, 3),
        (utc(2026, 3, 29, 8, 25), t_next, 4),  # 08:25 UTC = 09:25 BST: after cutoff
    ]
    assert picked(select_at_cutoff(frame(rows), CUTOFF)) == {t_d: 1, t_next: 3}


def test_fall_back_day_25_hours_share_one_cutoff() -> None:
    # Clocks go back 2026-10-25 02:00 BST -> 01:00 GMT (a 25-hour delivery day).
    first = utc(2026, 10, 24, 23)  # 00:00 BST on 25 Oct
    last = utc(2026, 10, 25, 23)  # 23:00 GMT on 25 Oct
    starts = pd.Series(pd.to_datetime([first, last], utc=True))
    cutoffs = cutoff_per_target(starts, CUTOFF)
    # 24 Oct 09:20 BST = 08:20 UTC for both ends of the 25-hour day.
    assert list(cutoffs) == [pd.Timestamp(utc(2026, 10, 24, 8, 20))] * 2


def test_past_dated_rows_are_never_selected() -> None:
    # WINDFOR includes rows for hours already over when published; these are not forecasts.
    target = utc(2026, 1, 10, 3)
    rows = [(utc(2026, 1, 10, 4, 30), target, 9)]
    assert select_at_cutoff(frame(rows), time(23, 59)).empty
    assert select_at_horizon(frame(rows), 0).empty


def test_empty_input() -> None:
    assert select_at_cutoff(frame([]), CUTOFF).empty
    assert select_at_horizon(frame([]), 4).empty


# -- horizon mode ------------------------------------------------------------------------------


def test_horizon_boundary_is_inclusive() -> None:
    target = utc(2026, 1, 10, 12)
    rows = [
        (utc(2026, 1, 10, 4, 30), target, 1),
        (utc(2026, 1, 10, 8, 0), target, 2),  # exactly 4h before
        (utc(2026, 1, 10, 9, 30), target, 3),
    ]
    assert picked(select_at_horizon(frame(rows), 4)) == {target: 2}
    assert picked(select_at_horizon(frame(rows), 4.01)) == {target: 1}
    assert picked(select_at_horizon(frame(rows), 0)) == {target: 3}


def test_horizon_uses_each_targets_own_limit() -> None:
    a, b = utc(2026, 1, 10, 10), utc(2026, 1, 10, 14)
    p1, p2 = utc(2026, 1, 10, 4, 30), utc(2026, 1, 10, 9, 30)
    rows = [(p, t, v) for t in (a, b) for p, v in ((p1, 1), (p2, 2))]
    assert picked(select_at_horizon(frame(rows), 4)) == {a: 1, b: 2}


def test_negative_horizon_rejected() -> None:
    with pytest.raises(ValueError, match=">= 0"):
        select_at_horizon(frame([]), -1)


# -- property-style check against a brute-force reference --------------------------------------


def _reference_cutoff(
    rows: list[tuple[datetime, datetime, float]], cutoff: time
) -> dict[datetime, float]:
    best: dict[datetime, tuple[datetime, float]] = {}
    for publish, start, value in rows:
        limit = decision_cutoff(delivery_day_of(start), cutoff)
        if (
            publish <= limit
            and publish <= start
            and (start not in best or publish > best[start][0])
        ):
            best[start] = (publish, value)
    return {k: v for k, (_, v) in best.items()}


def _reference_horizon(
    rows: list[tuple[datetime, datetime, float]], h: float
) -> dict[datetime, float]:
    best: dict[datetime, tuple[datetime, float]] = {}
    for publish, start, value in rows:
        if publish <= start - timedelta(hours=h) and (
            start not in best or publish > best[start][0]
        ):
            best[start] = (publish, value)
    return {k: v for k, (_, v) in best.items()}


@pytest.mark.parametrize("seed", range(25))
def test_matches_brute_force_reference_and_never_leaks(seed: int) -> None:
    rng = random.Random(seed)
    base = utc(2026, 3, 27)  # spans the spring DST change
    publishes = sorted(
        {base + timedelta(minutes=rng.randrange(0, 5 * 24 * 60, 5)) for _ in range(30)}
    )
    rows: list[tuple[datetime, datetime, float]] = []
    for p in publishes:
        first = p.replace(minute=0) - timedelta(hours=rng.randrange(0, 6))
        rows.extend(
            (p, first + timedelta(hours=k), float(rng.randrange(1000, 20000))) for k in range(48)
        )
    df = frame(rows)
    cutoff = time(rng.randrange(0, 24), rng.choice([0, 20, 50]))
    sel = select_at_cutoff(df, cutoff)
    assert picked(sel) == _reference_cutoff(rows, cutoff)
    assert (sel["publish_time"] <= sel["decision_time"]).all()
    assert (sel["publish_time"] <= sel["target_time"]).all()
    for t, d in zip(sel["target_time"], sel["decision_time"], strict=True):
        assert d.to_pydatetime() == decision_cutoff(delivery_day_of(t.to_pydatetime()), cutoff)

    h = rng.choice([0, 1, 4, 12, 24, 36])
    sel_h = select_at_horizon(df, h)
    assert picked(sel_h) == _reference_horizon(rows, h)
    assert (sel_h["horizon_h"] >= h).all()
