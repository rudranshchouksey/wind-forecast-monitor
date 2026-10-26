"""Health, metadata and the optional refresh job."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app import __version__
from app.api.deps import RepoDep, ServiceDep, SettingsDep
from app.clients.elexon import ElexonClient
from app.models import api
from app.services.analysis import DEFAULT_HORIZONS, MAX_HORIZON_H
from app.services.ingestion import run_ingest

router = APIRouter()

CUTOFF_PRESETS = [
    api.CutoffPreset(
        label="EPEX GB hourly (09:20)",
        time="09:20",
        description="Earliest GB day-ahead gate closure; default, no look-ahead for any auction",
    ),
    api.CutoffPreset(
        label="Nord Pool N2EX (09:50)",
        time="09:50",
        description="Nord Pool GB day-ahead auction gate closure",
    ),
    api.CutoffPreset(
        label="Legacy 11:00",
        time="11:00",
        description="Pre-2021 coupled auction timing; uses a forecast after the EPEX gate",
    ),
]


@router.get("/health", response_model=api.HealthResponse, tags=["system"])
def health(repo: RepoDep, settings: SettingsDep) -> api.HealthResponse:
    if not repo.path.exists():
        return api.HealthResponse(
            status="degraded", version=__version__, data=None, detail="database not found"
        )
    extent = repo.extent()
    last = repo.last_ingest()
    data = api.DataStatus(
        first_day=settings.delivery_from,
        last_day=settings.delivery_to,
        actual_rows=extent.actual_rows,
        forecast_rows=extent.forecast_rows,
        publishes=extent.publishes,
        actuals_from=extent.actuals_from,
        actuals_to=extent.actuals_to,
        publish_from=extent.publish_from,
        publish_to=extent.publish_to,
        last_ingest_at=last.finished_at if last else None,
    )
    ok = extent.actual_rows > 0 and extent.forecast_rows > 0
    return api.HealthResponse(
        status="ok" if ok else "degraded",
        version=__version__,
        data=data,
        detail=None if ok else "no data ingested",
    )


@router.get("/meta", response_model=api.MetaResponse, tags=["system"])
def meta(settings: SettingsDep) -> api.MetaResponse:
    return api.MetaResponse(
        first_day=settings.delivery_from,
        last_day=settings.delivery_to,
        timezone=settings.timezone,
        default_cutoff_time=settings.cutoff_time.strftime("%H:%M"),
        cutoff_presets=CUTOFF_PRESETS,
        max_horizon_h=MAX_HORIZON_H,
        default_horizons=list(DEFAULT_HORIZONS),
        default_percentile=settings.default_percentile,
        alignment=settings.alignment,
        mape_min_actual_mw=settings.mape_min_actual_mw,
    )


@router.post(
    "/admin/refresh",
    response_model=api.RefreshResponse,
    tags=["system"],
    summary="Re-ingest from Elexon (disabled unless APP_REFRESH_TOKEN is set)",
    responses={401: {"model": api.ProblemDetail}, 404: {"model": api.ProblemDetail}},
)
async def refresh(
    settings: SettingsDep,
    repo: RepoDep,
    service: ServiceDep,
    x_refresh_token: Annotated[str | None, Header()] = None,
) -> api.RefreshResponse:
    token = settings.refresh_token
    if token is None or settings.database_read_only:
        raise HTTPException(404, "refresh is disabled on this deployment")
    if not x_refresh_token or not secrets.compare_digest(
        x_refresh_token.encode(), token.get_secret_value().encode()
    ):
        raise HTTPException(401, "invalid refresh token")
    async with ElexonClient.from_settings(settings) as client:
        summary = await run_ingest(
            settings, client, repo, settings.delivery_from, settings.delivery_to
        )
    service.reload()
    return api.RefreshResponse(
        actuals_inserted=summary.actuals.inserted,
        actuals_updated=summary.actuals.updated,
        forecasts_inserted=summary.forecasts.inserted,
        forecasts_updated=summary.forecasts.updated,
        quality=summary.quality.lines(),
    )
