"""Metrics against hand-calculated fixtures (worked values in comments)."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from app.services.alignment import hourly_actuals
from app.services.insight import OFFSET_CAVEAT, buffer_recommendation
from app.services.metrics import compute_metrics, histogram
from tests.conftest import utc

# forecast - actual = [-10, +20, -30, +50]
FORECAST = [100.0, 200.0, 300.0, 400.0]
ACTUAL = [110.0, 180.0, 330.0, 350.0]


def test_core_metrics_hand_calculated() -> None:
    m = compute_metrics(FORECAST, ACTUAL, mape_min_actual_mw=150)
    assert m.n == 4
    assert m.mae_mw == pytest.approx(27.5)  # (10+20+30+50)/4
    assert m.rmse_mw == pytest.approx(math.sqrt(975))  # (100+400+900+2500)/4
    assert m.bias_mw == pytest.approx(7.5)  # 30/4: forecasts run high
    # MAPE only where actual >= 150: (20/180 + 30/330 + 50/350)/3
    assert m.mape_n == 3
    assert m.mape_pct == pytest.approx((20 / 180 + 30 / 330 + 50 / 350) / 3 * 100)


def test_absolute_error_percentiles_linear_interpolation() -> None:
    m = compute_metrics(FORECAST, ACTUAL)
    # sorted |e| = [10, 20, 30, 50]; rank = q*(n-1)
    assert m.abs_p50_mw == pytest.approx(25.0)  # rank 1.5
    assert m.abs_p90_mw == pytest.approx(44.0)  # rank 2.7 -> 30 + 0.7*20
    assert m.abs_p99_mw == pytest.approx(49.4)  # rank 2.97


def test_directional_split() -> None:
    m = compute_metrics(FORECAST, ACTUAL)
    # shortfall (forecast above actual): [20, 50]
    assert m.shortfall.n == 2
    assert m.shortfall.share == pytest.approx(0.5)
    assert m.shortfall.mean_mw == pytest.approx(35.0)
    assert m.shortfall.p90_mw == pytest.approx(47.0)  # 20 + 0.9*30
    assert m.shortfall.max_mw == pytest.approx(50.0)
    # surplus (actual above forecast): [10, 30]
    assert m.surplus.mean_mw == pytest.approx(20.0)
    assert m.surplus.p90_mw == pytest.approx(28.0)


def test_exact_forecast_counts_in_neither_direction() -> None:
    m = compute_metrics([5.0, 7.0], [5.0, 6.0])
    assert (m.shortfall.n, m.surplus.n) == (1, 0)
    assert m.surplus.share == 0.0
    assert m.surplus.mean_mw is None


def test_empty_and_mape_without_eligible_hours() -> None:
    m = compute_metrics([], [])
    assert m.n == 0
    assert m.mae_mw is None
    assert m.shortfall.share is None
    low = compute_metrics([10.0], [20.0], mape_min_actual_mw=1000)
    assert low.mape_pct is None
    assert low.mape_n == 0


def test_rejects_bad_input() -> None:
    with pytest.raises(ValueError, match="same shape"):
        compute_metrics([1.0, 2.0], [1.0])
    with pytest.raises(ValueError, match="finite"):
        compute_metrics([1.0, float("nan")], [1.0, 2.0])


def test_histogram_bins_align_to_zero() -> None:
    h = histogram([-250, -10, 0, 10, 490], 250)
    assert h.edges == [-250, 0, 250, 500]
    assert h.counts == [2, 2, 1]
    assert sum(h.counts) == 5
    assert histogram([], 100).counts == []
    assert histogram([0, 0], 100).edges == [0, 100]
    with pytest.raises(ValueError, match="positive"):
        histogram([1], 0)


# -- buffer insight ----------------------------------------------------------------------------


def test_buffer_is_percentile_of_signed_error() -> None:
    errors = np.arange(1, 11) * 100.0  # 100..1000, every hour a shortfall
    ins = buffer_recommendation(errors, 90)
    assert ins.buffer_mw == pytest.approx(910.0)  # rank 8.1 -> 900 + 0.1*100
    assert ins.achieved_coverage == pytest.approx(0.9)
    assert ins.offset_mw == pytest.approx(550.0)
    assert ins.random_component_mw == pytest.approx(360.0)
    assert ins.caveat == OFFSET_CAVEAT
    assert "910 MW less wind" in ins.headline
    assert "90%" in ins.headline


def test_no_buffer_needed_when_forecasts_run_low() -> None:
    ins = buffer_recommendation([-300.0, -200.0, -100.0], 90)
    assert ins.buffer_mw == 0.0
    assert ins.achieved_coverage == 1.0
    assert ins.caveat is None
    assert "below" in ins.detail


def test_buffer_edge_cases() -> None:
    assert buffer_recommendation([], 90).buffer_mw is None
    with pytest.raises(ValueError, match="between"):
        buffer_recommendation([1.0], 100)


# -- alignment ---------------------------------------------------------------------------------


def _actuals(points: list[tuple[int, int, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "start_time": pd.to_datetime([utc(2026, 1, 2, h, m) for h, m, _ in points], utc=True),
            "generation_mw": [v for *_, v in points],
        }
    )


def test_hour_mean_requires_both_half_hours() -> None:
    s = hourly_actuals(_actuals([(0, 0, 100), (0, 30, 200), (1, 0, 300)]), "hour_mean")
    assert s.to_dict() == {pd.Timestamp(utc(2026, 1, 2, 0)): 150.0}
    assert s.name == "actual_mw"


def test_point_alignment_uses_on_the_hour_value() -> None:
    s = hourly_actuals(_actuals([(0, 0, 100), (0, 30, 200), (1, 0, 300)]), "point")
    assert s.tolist() == [100.0, 300.0]


def test_alignment_of_empty_input() -> None:
    assert hourly_actuals(_actuals([])).empty
