from __future__ import annotations

from datetime import date, time
from pathlib import Path

import httpx
import pytest
import respx

from app import ingest as cli
from app.clients.elexon import ElexonClient
from app.core.config import Settings
from app.repositories.sqlite import WindRepository
from app.services.ingestion import ingest_window, run_ingest
from tests.conftest import utc


def test_ingest_window_covers_lookback_and_full_last_day(settings: Settings) -> None:
    s = settings.model_copy(update={"cutoff_time": time(9, 20), "forecast_lookback_hours": 72})
    w = ingest_window(s, date(2026, 1, 2), date(2026, 2, 1))
    assert w.publish_from == utc(2025, 12, 29, 9, 20)
    assert w.publish_to == utc(2026, 2, 2)


def test_ingest_window_rejects_reversed_range(settings: Settings) -> None:
    with pytest.raises(ValueError, match="on or after"):
        ingest_window(settings, date(2026, 1, 5), date(2026, 1, 4))


def _mock_elexon(base: str) -> None:
    respx.get(f"{base}/FUELHH/stream").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "publishTime": "2026-01-02T00:30:00Z",
                    "startTime": "2026-01-02T00:00:00Z",
                    "fuelType": "WIND",
                    "generation": 9000,
                },
                {
                    "publishTime": "2026-01-02T01:00:00Z",
                    "startTime": "2026-01-02T00:30:00Z",
                    "fuelType": "WIND",
                    "generation": 9100,
                },
            ],
        )
    )
    respx.get(f"{base}/WINDFOR/stream").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "publishTime": "2026-01-01T09:30:00Z",
                    "startTime": "2026-01-02T00:00:00Z",
                    "generation": 9500,
                }
            ],
        )
    )


@respx.mock
async def test_run_ingest_end_to_end(settings: Settings, repo: WindRepository) -> None:
    _mock_elexon(settings.elexon_base_url)
    settings = settings.model_copy(update={"ingest_chunk_days": 1})
    async with ElexonClient.from_settings(settings) as client:
        summary = await run_ingest(settings, client, repo, date(2026, 1, 2), date(2026, 1, 2))
    assert summary.actuals.inserted == 2
    assert summary.forecasts.inserted == 1
    # The ~4.6-day publish window is fetched as 5 one-day chunks that all return the same row,
    # so de-duplication must collapse them to one.
    assert summary.quality.forecast_duplicates == 4
    assert len(summary.quality.missing_actual_periods) == 46
    run = repo.last_ingest()
    assert run is not None
    assert run.status == "ok"


@respx.mock
def test_cli_main_writes_database(
    settings: Settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _mock_elexon(settings.elexon_base_url)
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    db = tmp_path / "cli.sqlite"
    code = cli.main(["--from", "2026-01-02", "--to", "2026-01-02", "--db", str(db)])
    assert code == 0
    assert "actuals:   +2 new" in capsys.readouterr().out
    assert WindRepository(db).extent().actual_rows == 2


@respx.mock
def test_cli_reports_upstream_failure(
    settings: Settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    respx.get(f"{settings.elexon_base_url}/FUELHH/stream").mock(return_value=httpx.Response(404))
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    code = cli.main(["--from", "2026-01-02", "--to", "2026-01-02", "--db", str(tmp_path / "x")])
    assert code == 1
    assert "ingest failed" in capsys.readouterr().err


def test_cli_rejects_reversed_dates(settings: Settings) -> None:
    with pytest.raises(SystemExit):
        cli.parse_args(["--from", "2026-01-05", "--to", "2026-01-01"], settings)
