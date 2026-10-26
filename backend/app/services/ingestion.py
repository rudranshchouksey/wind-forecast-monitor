"""Fetch → validate → de-duplicate → quality-check → store."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.clients.elexon import ElexonClient
from app.core.config import Settings
from app.core.timeutils import decision_cutoff, delivery_range_bounds, format_utc
from app.repositories.sqlite import IngestRun, UpsertResult, WindRepository, utc_now
from app.services.quality import QualityReport, build_report, dedupe_actuals, dedupe_forecasts

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class IngestWindow:
    first_day: date
    last_day: date
    publish_from: datetime
    publish_to: datetime


@dataclass(frozen=True, slots=True)
class IngestSummary:
    window: IngestWindow
    actuals: UpsertResult
    forecasts: UpsertResult
    quality: QualityReport


def ingest_window(settings: Settings, first_day: date, last_day: date) -> IngestWindow:
    """Forecast publishes needed to analyse delivery days ``first_day..last_day``.

    Publishes start ``forecast_lookback_hours`` before the earliest cutoff, so that every
    supported horizon has data, and run to the end of the last delivery day.
    """
    if last_day < first_day:
        raise ValueError("last_day must be on or after first_day")
    earliest_cutoff = decision_cutoff(first_day, settings.cutoff_time)
    _, range_end = delivery_range_bounds(first_day, last_day)
    return IngestWindow(
        first_day=first_day,
        last_day=last_day,
        publish_from=earliest_cutoff - timedelta(hours=settings.forecast_lookback_hours),
        publish_to=range_end,
    )


async def run_ingest(
    settings: Settings,
    client: ElexonClient,
    repo: WindRepository,
    first_day: date,
    last_day: date,
) -> IngestSummary:
    started = utc_now()
    window = ingest_window(settings, first_day, last_day)
    logger.info(
        "ingest start days=%s..%s publishes=%s..%s",
        first_day,
        last_day,
        format_utc(window.publish_from),
        format_utc(window.publish_to),
    )
    raw_actuals = await client.fetch_wind_actuals(first_day, last_day)
    raw_forecasts = await client.fetch_wind_forecasts(window.publish_from, window.publish_to)

    actuals, actual_dups = dedupe_actuals(raw_actuals)
    forecasts, forecast_dups = dedupe_forecasts(raw_forecasts)
    report = build_report(
        actuals,
        forecasts,
        first_day,
        last_day,
        actual_duplicates=actual_dups,
        forecast_duplicates=forecast_dups,
    )

    repo.init_schema()
    a_res = repo.upsert_actuals(actuals)
    f_res = repo.upsert_forecasts(forecasts)
    repo.record_ingest_run(
        IngestRun(
            started_at=started,
            finished_at=utc_now(),
            params={
                "first_day": first_day.isoformat(),
                "last_day": last_day.isoformat(),
                "publish_from": format_utc(window.publish_from),
                "publish_to": format_utc(window.publish_to),
            },
            actual_rows=len(actuals),
            forecast_rows=len(forecasts),
            status="ok",
        )
    )
    for line in report.lines():
        logger.info("quality %s", line)
    return IngestSummary(window=window, actuals=a_res, forecasts=f_res, quality=report)
