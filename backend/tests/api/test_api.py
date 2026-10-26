from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app
from app.repositories.sqlite import WindRepository
from tests.fixtures import synthetic

FIRST, LAST = date(2026, 1, 2), date(2026, 1, 4)


def make_client(settings: Settings, **overrides: object) -> TestClient:
    s = settings.model_copy(update={"delivery_from": FIRST, "delivery_to": LAST, **overrides})
    return TestClient(create_app(s), raise_server_exceptions=False)


@pytest.fixture
def client(settings: Settings, repo: WindRepository) -> TestClient:
    synthetic.build(repo, FIRST, LAST)
    return make_client(settings)


# -- system ------------------------------------------------------------------------------------


def test_health_reports_snapshot(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["data"]["actual_rows"] == 144
    assert body["data"]["first_day"] == "2026-01-02"


def test_health_degraded_without_database(settings: Settings, tmp_path: Path) -> None:
    c = make_client(settings, database_path=tmp_path / "missing.sqlite")
    body = c.get("/api/v1/health").json()
    assert body["status"] == "degraded"
    assert body["data"] is None


def test_health_degraded_with_empty_database(settings: Settings, repo: WindRepository) -> None:
    body = make_client(settings).get("/api/v1/health").json()
    assert body["status"] == "degraded"
    assert body["detail"] == "no data ingested"


def test_meta_lists_cutoff_presets(client: TestClient) -> None:
    body = client.get("/api/v1/meta").json()
    assert body["default_cutoff_time"] == "09:20"
    assert [p["time"] for p in body["cutoff_presets"]] == ["09:20", "09:50", "11:00"]


def test_openapi_is_served(client: TestClient) -> None:
    spec = client.get("/api/v1/openapi.json").json()
    for path in ["/api/v1/metrics", "/api/v1/metrics/by-horizon", "/api/v1/error-distribution"]:
        assert path in spec["paths"]


# -- analysis ----------------------------------------------------------------------------------


def test_metrics_defaults_and_cache_header(client: TestClient) -> None:
    r = client.get("/api/v1/metrics")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=300"
    body = r.json()
    assert body["query"] == {
        "from": "2026-01-02", "to": "2026-01-04", "mode": "cutoff",
        "cutoff_time": "09:20", "horizon_h": None,
    }  # fmt: skip
    assert body["metrics"]["bias_mw"] == pytest.approx(780.0)
    assert body["coverage"]["ratio"] == 1.0
    assert body["insight"]["percentile"] == 90
    assert "MW less wind" in body["insight"]["headline"]


def test_metrics_respects_cutoff_and_percentile(client: TestClient) -> None:
    base = client.get("/api/v1/metrics").json()["metrics"]["mae_mw"]
    late = client.get("/api/v1/metrics", params={"cutoff_time": "11:00", "percentile": 99}).json()
    assert late["metrics"]["mae_mw"] == pytest.approx(base - 20)
    assert late["insight"]["percentile"] == 99


def test_horizon_mode(client: TestClient) -> None:
    body = client.get("/api/v1/metrics", params={"mode": "horizon", "horizon_h": 4}).json()
    assert body["query"]["horizon_h"] == 4
    assert body["mean_horizon_h"] >= 4


def test_forecast_vs_actual_json(client: TestClient) -> None:
    body = client.get(
        "/api/v1/forecast-vs-actual", params={"from": "2026-01-03", "to": "2026-01-03"}
    ).json()
    assert len(body["points"]) == 24
    p = body["points"][0]
    assert p["target_time"] == "2026-01-03T00:00:00Z"
    assert p["error_mw"] == pytest.approx(p["forecast_mw"] - p["actual_mw"])
    assert p["publish_time"] == "2026-01-02T07:30:00Z"


def test_forecast_vs_actual_csv(client: TestClient) -> None:
    r = client.get("/api/v1/forecast-vs-actual", params={"format": "csv", "to": "2026-01-02"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 24
    assert set(rows[0]) >= {"target_time", "target_time_london", "actual_mw", "forecast_mw"}


def test_by_horizon(client: TestClient) -> None:
    body = client.get("/api/v1/metrics/by-horizon", params={"horizons": "1,12,24"}).json()
    assert [r["horizon_h"] for r in body["rows"]] == [1, 12, 24]
    assert body["reference"]["horizon_h"] == pytest.approx(28.0)
    default = client.get("/api/v1/metrics/by-horizon").json()
    assert len(default["rows"]) == 9


@pytest.mark.parametrize("bad", ["a,b", "100", ""])
def test_by_horizon_rejects_bad_list(client: TestClient, bad: str) -> None:
    r = client.get("/api/v1/metrics/by-horizon", params={"horizons": bad})
    if bad == "":
        assert r.status_code == 200
    else:
        assert r.status_code == 400
        assert r.headers["content-type"] == "application/problem+json"


def test_by_hour_and_day(client: TestClient) -> None:
    hours = client.get("/api/v1/metrics/by-hour").json()
    assert hours["group_by"] == "hour"
    assert len(hours["rows"]) == 24
    days = client.get("/api/v1/metrics/by-day").json()
    assert [r["key"] for r in days["rows"]] == ["2026-01-02", "2026-01-03", "2026-01-04"]


def test_error_distribution(client: TestClient) -> None:
    body = client.get("/api/v1/error-distribution", params={"bin_mw": 100}).json()
    assert body["n"] == 72
    assert sum(b["count"] for b in body["bins"]) == 72
    assert body["bins"][0]["upper_mw"] - body["bins"][0]["lower_mw"] == 100
    assert "p90" in body["quantiles"]


def test_bias_diagnostics(client: TestClient) -> None:
    body = client.get("/api/v1/diagnostics/bias").json()
    assert body["overall_bias_mw"] == pytest.approx(780.0)
    assert body["hindcast"]["n"] > 0


# -- validation and errors ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"cutoff_time": "25:00"}, 422),
        ({"cutoff_time": "9:20"}, 422),
        ({"mode": "tomorrow"}, 422),
        ({"horizon_h": -1}, 422),
        ({"from": "2026-13-01"}, 422),
        ({"from": "2025-12-01"}, 400),
        ({"from": "2026-01-04", "to": "2026-01-02"}, 400),
        ({"percentile": 100}, 422),
    ],
)
def test_invalid_parameters_return_problem_json(
    client: TestClient, params: dict[str, object], status: int
) -> None:
    r = client.get("/api/v1/metrics", params=params)
    assert r.status_code == status
    assert r.headers["content-type"] == "application/problem+json"
    body = r.json()
    assert body["status"] == status
    assert body["title"]


def test_missing_data_returns_503(settings: Settings, tmp_path: Path) -> None:
    c = make_client(settings, database_path=tmp_path / "missing.sqlite")
    r = c.get("/api/v1/metrics")
    assert r.status_code == 503
    assert "not found" in r.json()["detail"]


def test_unknown_route_is_problem_json(client: TestClient) -> None:
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.headers["content-type"] == "application/problem+json"


def test_unexpected_errors_are_500_problem(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = client.app.state.service  # type: ignore[attr-defined]

    def boom(*_: object) -> None:
        raise RuntimeError("kaboom")

    monkeypatch.setattr(service, "metrics", boom)
    r = client.get("/api/v1/metrics")
    assert r.status_code == 500
    assert "kaboom" not in r.text


# -- refresh -----------------------------------------------------------------------------------


def test_refresh_disabled_without_token(client: TestClient) -> None:
    assert client.post("/api/v1/admin/refresh").status_code == 404


def test_refresh_disabled_on_read_only_deploy(settings: Settings, repo: WindRepository) -> None:
    c = make_client(settings, refresh_token=SecretStr("s3cret"), database_read_only=True)
    r = c.post("/api/v1/admin/refresh", headers={"X-Refresh-Token": "s3cret"})
    assert r.status_code == 404


def test_refresh_rejects_bad_token(settings: Settings, repo: WindRepository) -> None:
    c = make_client(settings, refresh_token=SecretStr("s3cret"))
    assert c.post("/api/v1/admin/refresh", headers={"X-Refresh-Token": "nope"}).status_code == 401
    assert c.post("/api/v1/admin/refresh").status_code == 401


@respx.mock
def test_refresh_ingests_with_mocked_elexon_and_clears_cache(
    settings: Settings, repo: WindRepository
) -> None:
    synthetic.build(repo, FIRST, LAST)
    c = make_client(settings, refresh_token=SecretStr("s3cret"))
    before = c.get("/api/v1/metrics").json()["metrics"]
    base = settings.elexon_base_url
    respx.route(host="testserver").pass_through()
    respx.get(f"{base}/FUELHH/stream").mock(
        return_value=httpx.Response(
            200,
            json=[{"publishTime": "2026-01-05T00:30:00Z", "startTime": "2026-01-02T00:00:00Z",
                   "fuelType": "WIND", "generation": 1.0}],
        )
    )  # fmt: skip
    respx.get(f"{base}/WINDFOR/stream").mock(return_value=httpx.Response(200, json=[]))
    r = c.post("/api/v1/admin/refresh", headers={"X-Refresh-Token": "s3cret"})
    assert r.status_code == 200, r.text
    assert r.json()["actuals_updated"] == 1
    after = c.get("/api/v1/metrics").json()["metrics"]
    # The 00:00 actual was revised from 8000 to 1 MW, lowering that hour's mean by ~4000 MW.
    # A changed bias proves the cached evaluation was dropped and the new data is served.
    assert after["n"] == before["n"]
    assert after["bias_mw"] == pytest.approx(before["bias_mw"] + 3999.5 / before["n"])


@respx.mock
def test_refresh_upstream_failure_is_502(settings: Settings, repo: WindRepository) -> None:
    c = make_client(settings, refresh_token=SecretStr("s3cret"), http_max_retries=0)
    respx.route(host="testserver").pass_through()
    respx.get(f"{settings.elexon_base_url}/FUELHH/stream").mock(return_value=httpx.Response(500))
    r = c.post("/api/v1/admin/refresh", headers={"X-Refresh-Token": "s3cret"})
    assert r.status_code == 502


def test_serves_frontend_when_built(
    settings: Settings, repo: WindRepository, tmp_path: Path
) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>dashboard</h1>", encoding="utf-8")
    c = make_client(settings, frontend_dist=dist)
    assert "dashboard" in c.get("/").text
    assert c.get("/api/v1/meta").status_code == 200
