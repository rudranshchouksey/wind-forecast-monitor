from __future__ import annotations

from datetime import date, time
from pathlib import Path

import numpy as np
import pytest

from app.core.config import Settings
from app.repositories.sqlite import WindRepository
from app.services.analysis import AnalysisQuery, AnalysisService, DataUnavailableError, QueryError
from tests.fixtures import synthetic

FIRST, LAST = date(2026, 1, 2), date(2026, 1, 4)


@pytest.fixture
def service(settings: Settings, repo: WindRepository) -> AnalysisService:
    synthetic.build(repo, FIRST, LAST)
    s = settings.model_copy(update={"delivery_from": FIRST, "delivery_to": LAST})
    return AnalysisService(repo, s)


def q(**kw: object) -> AnalysisQuery:
    return AnalysisQuery(FIRST, LAST, **kw)  # type: ignore[arg-type]


def test_cutoff_evaluation_has_full_coverage_and_exact_errors(service: AnalysisService) -> None:
    ev = service.evaluate(q(cutoff_time=time(9, 20)))
    assert ev.coverage.expected_hours == 72
    assert ev.coverage.evaluated == 72
    assert ev.coverage.ratio == 1.0
    # Latest publish before D-1 09:20 is D-1 07:30, so horizons are 16.5 h .. 39.5 h.
    assert ev.frame["horizon_h"].min() == pytest.approx(16.5)
    assert ev.frame["horizon_h"].max() == pytest.approx(39.5)
    expected = synthetic.BIAS + synthetic.SLOPE * ev.frame["horizon_h"]
    np.testing.assert_allclose(ev.frame["error_mw"], expected)
    assert (ev.frame["publish_time"] <= ev.frame["decision_time"]).all()


def test_metrics_and_insight(service: AnalysisService) -> None:
    res = service.metrics(q(), percentile=90)
    # mean horizon = 28 h, so bias = 500 + 10*28
    assert res.mean_horizon_h == pytest.approx(28.0)
    assert res.metrics.bias_mw == pytest.approx(780.0)
    assert res.metrics.surplus.n == 0
    assert res.insight.buffer_mw is not None
    assert res.insight.achieved_coverage is not None
    assert res.insight.achieved_coverage >= 0.9


def test_later_cutoff_shortens_horizon_and_reduces_error(service: AnalysisService) -> None:
    early = service.metrics(q(cutoff_time=time(9, 20)), 90).metrics
    late = service.metrics(q(cutoff_time=time(11, 0)), 90).metrics
    assert late.mae_mw is not None
    assert early.mae_mw is not None
    assert late.mae_mw == pytest.approx(early.mae_mw - 20.0)  # 09:30 publish vs 07:30: 2 h closer


def test_horizon_mode_and_breakdown(service: AnalysisService) -> None:
    rows = service.by_horizon(q(), horizons=[24, 1, 4, 4])
    assert [r.horizon_h for r in rows] == [1.0, 4.0, 24.0]
    maes = [r.metrics.mae_mw for r in rows if r.metrics.mae_mw is not None]
    assert len(maes) == 3
    assert maes == sorted(maes)  # error grows with horizon in the synthetic data
    for r in rows:
        assert r.metrics.mae_mw is not None
        assert r.metrics.mae_mw >= synthetic.BIAS + synthetic.SLOPE * r.horizon_h


def test_by_hour_and_by_day_keys(service: AnalysisService) -> None:
    hours = service.by_hour(q())
    assert [g.key for g in hours] == [str(h) for h in range(24)]
    assert all(g.metrics.n == 3 for g in hours)
    days = service.by_day(q())
    assert [g.key for g in days] == ["2026-01-02", "2026-01-03", "2026-01-04"]


def test_distribution_and_diagnostics(service: AnalysisService) -> None:
    dist = service.distribution(q(), bin_width_mw=100)
    assert dist.n == 72
    assert sum(dist.histogram.counts) == 72
    assert dist.quantiles["p50"] > 0
    diag = service.bias_diagnostics(q())
    assert diag.overall_bias_mw == pytest.approx(780.0)
    assert diag.bias_at_zero_horizon_mw is not None
    assert diag.hindcast.n > 0
    assert diag.hindcast.bias_mw is not None
    assert diag.hindcast.bias_mw < synthetic.BIAS  # negative horizons pull it below the bias
    assert next(b.label for b in diag.by_forecast_level) == "0-5 GW"


def test_results_are_cached_and_reload_clears(service: AnalysisService) -> None:
    a = service.evaluate(q())
    assert service.evaluate(q()) is a
    service.reload()
    assert service.evaluate(q()) is not a


def test_cache_is_bounded(settings: Settings, repo: WindRepository) -> None:
    synthetic.build(repo, FIRST, LAST)
    s = settings.model_copy(update={"delivery_from": FIRST, "delivery_to": LAST})
    svc = AnalysisService(repo, s, cache_size=2)
    first = svc.evaluate(q(horizon_h=1, mode="horizon"))
    svc.evaluate(q(horizon_h=2, mode="horizon"))
    svc.evaluate(q(horizon_h=3, mode="horizon"))
    assert svc.evaluate(q(horizon_h=1, mode="horizon")) is not first


@pytest.mark.parametrize(
    ("query", "message"),
    [
        (AnalysisQuery(date(2026, 1, 3), date(2026, 1, 2)), "on or after"),
        (AnalysisQuery(date(2025, 12, 1), date(2026, 1, 2)), "within"),
        (AnalysisQuery(FIRST, LAST, "horizon", time(9, 20), 100), "horizon_h"),
    ],
)
def test_invalid_queries(service: AnalysisService, query: AnalysisQuery, message: str) -> None:
    with pytest.raises(QueryError, match=message):
        service.evaluate(query)


def test_missing_or_empty_database(settings: Settings, tmp_path: Path) -> None:
    missing = AnalysisService(WindRepository(tmp_path / "nope.sqlite"), settings)
    with pytest.raises(DataUnavailableError, match="not found"):
        missing.evaluate(AnalysisQuery(settings.delivery_from, settings.delivery_from))
    empty_repo = WindRepository(tmp_path / "empty.sqlite")
    empty_repo.init_schema()
    with pytest.raises(DataUnavailableError, match="no data"):
        AnalysisService(empty_repo, settings).evaluate(
            AnalysisQuery(settings.delivery_from, settings.delivery_from)
        )
