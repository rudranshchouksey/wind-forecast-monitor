"""Rolling bias correction: exactness, window bounds and a no-leakage proof."""

from __future__ import annotations

from datetime import date, time, timedelta

import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest

from app.core.timeutils import decision_cutoff, delivery_day_bounds
from app.services.correction import rolling_linear_correction, training_days

FIRST = date(2026, 1, 1)
DAYS = 20


def evaluation_frame(seed: int = 0, days: int = DAYS, first: date = FIRST) -> pd.DataFrame:
    """Hourly cutoff-mode evaluation rows with noisy, roughly linear forecast/actual."""
    rng = np.random.default_rng(seed)
    start, _ = delivery_day_bounds(first)
    times = pd.date_range(start, periods=days * 24, freq="h")
    forecast = rng.uniform(2000, 20000, len(times))
    actual = 0.85 * forecast - 300 + rng.normal(0, 800, len(times))
    return pd.DataFrame({"target_time": times, "forecast_mw": forecast, "actual_mw": actual})


def corrected_for(frame: pd.DataFrame, day: date) -> npt.NDArray[np.float64]:
    out, _ = rolling_linear_correction(frame, window_days=7)
    days = out["target_time"].dt.tz_convert("Europe/London").dt.date
    values: npt.NDArray[np.float64] = out.loc[days == day, "corrected_mw"].to_numpy(dtype=float)
    return values


def test_training_window_is_complete_days_before_the_cutoff() -> None:
    assert training_days(date(2026, 1, 20), 7) == (date(2026, 1, 12), date(2026, 1, 18))


def test_recovers_an_exact_linear_relationship() -> None:
    frame = evaluation_frame()
    frame["actual_mw"] = 0.8 * frame["forecast_mw"] + 500
    out, fits = rolling_linear_correction(frame, window_days=7)
    assert fits
    assert fits[0].slope == pytest.approx(0.8)
    assert fits[0].intercept == pytest.approx(500)
    done = out.dropna(subset=["corrected_mw"])
    np.testing.assert_allclose(done["corrected_mw"], done["actual_mw"])


def test_days_without_enough_history_are_left_empty() -> None:
    out, fits = rolling_linear_correction(evaluation_frame(), window_days=7)
    days = out["target_time"].dt.tz_convert("Europe/London").dt.date
    # The first fit needs 72 h of complete days before D-1: D = FIRST + 4 has FIRST..FIRST+2.
    first_fit_day = fits[0].day
    assert first_fit_day == FIRST + timedelta(days=4)
    assert out.loc[days < first_fit_day, "corrected_mw"].isna().all()
    assert out.loc[days >= first_fit_day, "corrected_mw"].notna().all()


@pytest.mark.parametrize("cutoff", [time(9, 20), time(0, 0), time(23, 59)])
def test_every_fit_uses_only_actuals_known_before_the_cutoff(cutoff: time) -> None:
    frame = evaluation_frame()
    _, fits = rolling_linear_correction(frame, window_days=7)
    for fit in fits:
        assert fit.train_last_day == fit.day - timedelta(days=2)
        # The last training hour ends (and its actual is published) by midnight starting D-1,
        # which is never later than the D-1 cutoff, whatever cutoff time is configured.
        _, last_train_end = delivery_day_bounds(fit.train_last_day)
        assert last_train_end <= decision_cutoff(fit.day, cutoff)


@pytest.mark.parametrize("target_offset", [8, 12, 19])
def test_no_leakage_changing_the_future_does_not_change_the_correction(target_offset: int) -> None:
    """Perturb everything not known at D's cutoff (actuals from D-1 on, forecasts after D).

    If the correction for D used any of it, D's corrected values would move.
    """
    frame = evaluation_frame(seed=1)
    day = FIRST + timedelta(days=target_offset)
    before = corrected_for(frame, day)

    tampered = frame.copy()
    days = tampered["target_time"].dt.tz_convert("Europe/London").dt.date
    unknown_actuals = days >= day - timedelta(days=1)
    tampered.loc[unknown_actuals, "actual_mw"] = 1e6 * (1 + np.arange(unknown_actuals.sum()))
    later = days > day
    tampered.loc[later, "forecast_mw"] = -5e5 * (1 + np.arange(later.sum()) % 7)

    after = corrected_for(tampered, day)
    np.testing.assert_array_equal(before, after)
    assert not np.isnan(before).any()


def test_using_d_minus_1_would_be_detected() -> None:
    """Sanity check on the test above: tampering with D-2 (which *is* known) does change D."""
    frame = evaluation_frame(seed=2)
    day = FIRST + timedelta(days=12)
    before = corrected_for(frame, day)
    tampered = frame.copy()
    days = tampered["target_time"].dt.tz_convert("Europe/London").dt.date
    tampered.loc[days == day - timedelta(days=2), "actual_mw"] += 5000
    assert not np.allclose(before, corrected_for(tampered, day))


def test_flat_training_forecast_gives_no_fit() -> None:
    frame = evaluation_frame()
    frame["forecast_mw"] = 10_000.0
    out, fits = rolling_linear_correction(frame, window_days=7)
    assert fits == []
    assert out["corrected_mw"].isna().all()


def test_empty_and_invalid_input() -> None:
    empty = evaluation_frame().iloc[0:0]
    out, fits = rolling_linear_correction(empty)
    assert out.empty
    assert fits == []
    with pytest.raises(ValueError, match="window_days"):
        rolling_linear_correction(evaluation_frame(), window_days=0)
