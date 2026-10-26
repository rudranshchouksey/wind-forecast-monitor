from __future__ import annotations

from datetime import date, timedelta

from app.models.records import ActualRecord, ForecastRecord
from app.repositories.sqlite import IngestRun, WindRepository
from app.services.quality import build_report, dedupe_actuals, dedupe_forecasts
from tests.conftest import utc


def test_actual_upsert_is_idempotent_and_later_revision_wins(repo: WindRepository) -> None:
    t = utc(2026, 1, 2)
    first = repo.upsert_actuals([ActualRecord(t, 100, utc(2026, 1, 2, 0, 30))])
    again = repo.upsert_actuals([ActualRecord(t, 100, utc(2026, 1, 2, 0, 30))])
    revised = repo.upsert_actuals([ActualRecord(t, 120, utc(2026, 1, 2, 2))])
    stale = repo.upsert_actuals([ActualRecord(t, 90, utc(2026, 1, 2, 1))])
    assert (first.inserted, again.inserted, again.updated) == (1, 0, 0)
    assert (revised.inserted, revised.updated) == (0, 1)
    assert stale.updated == 0
    df = repo.load_actuals(utc(2026, 1, 2), utc(2026, 1, 3))
    assert df["generation_mw"].tolist() == [120]


def test_forecast_upsert_and_load_window(repo: WindRepository) -> None:
    rows = [ForecastRecord(utc(2026, 1, 1, 9, 30), utc(2026, 1, 2, h), 1000 + h) for h in range(3)]
    assert repo.upsert_forecasts(rows).inserted == 3
    assert repo.upsert_forecasts(rows).inserted == 0
    df = repo.load_forecasts(utc(2026, 1, 2, 1), utc(2026, 1, 2, 3))
    assert df["generation_mw"].tolist() == [1001, 1002]
    assert str(df["publish_time"].dt.tz) == "UTC"


def test_read_only_mode_and_metadata(repo: WindRepository) -> None:
    repo.upsert_actuals([ActualRecord(utc(2026, 1, 2), 5, utc(2026, 1, 2, 0, 30))])
    repo.upsert_forecasts([ForecastRecord(utc(2026, 1, 1, 9, 30), utc(2026, 1, 2), 7)])
    assert repo.last_ingest() is None
    repo.record_ingest_run(
        IngestRun(utc(2026, 1, 3), utc(2026, 1, 3, 0, 1), {"a": "b"}, 1, 1, "ok")
    )
    ro = WindRepository(repo.path, read_only=True)
    extent = ro.extent()
    assert (extent.actual_rows, extent.forecast_rows, extent.publishes) == (1, 1, 1)
    assert extent.publish_from == utc(2026, 1, 1, 9, 30)
    last = ro.last_ingest()
    assert last is not None
    assert last.params == {"a": "b"}


def test_empty_extent(repo: WindRepository) -> None:
    extent = repo.extent()
    assert extent.actual_rows == 0
    assert extent.actuals_from is None


def test_dedupe_actuals_keeps_latest_publish() -> None:
    t = utc(2026, 1, 2)
    rows = [
        ActualRecord(t, 1, utc(2026, 1, 2, 1)),
        ActualRecord(t, 2, utc(2026, 1, 2, 3)),
        ActualRecord(t, 3, utc(2026, 1, 2, 2)),
    ]
    kept, dups = dedupe_actuals(rows)
    assert dups == 2
    assert kept[0].generation_mw == 2


def test_dedupe_forecasts_last_wins() -> None:
    p, t = utc(2026, 1, 1, 9, 30), utc(2026, 1, 2)
    kept, dups = dedupe_forecasts([ForecastRecord(p, t, 1), ForecastRecord(p, t, 2)])
    assert (dups, kept[0].generation_mw) == (1, 2)


def test_quality_report_flags_gaps_and_irregular_publishes() -> None:
    day = date(2026, 1, 2)
    actuals = [
        ActualRecord(utc(2026, 1, 2) + timedelta(minutes=30 * i), 1, utc(2026, 1, 3))
        for i in range(48)
        if i != 10
    ]
    forecasts = [
        ForecastRecord(utc(2026, 1, 1, 9, 30), utc(2026, 1, 1, 8), 1),  # past-dated
        ForecastRecord(utc(2026, 1, 1, 12, 25), utc(2026, 1, 2), 1),
    ]
    report = build_report(actuals, forecasts, day, day, actual_duplicates=0, forecast_duplicates=0)
    assert report.missing_actual_periods == ["2026-01-02T05:00:00Z"]
    assert report.irregular_publish_times == ["2026-01-01T12:25:00Z"]
    assert report.past_dated_forecast_rows == 1
    assert report.publishes_per_day == {"2026-01-01": 2}
    assert any("missing half-hourly actual periods: 1" in line for line in report.lines())
