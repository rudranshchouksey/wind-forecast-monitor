"""FastAPI dependencies: shared singletons and validated query parameters."""

from __future__ import annotations

from datetime import date, time
from typing import Annotated

from fastapi import Depends, Query, Request, Response

from app.core.config import Settings
from app.repositories.sqlite import WindRepository
from app.services.analysis import MAX_HORIZON_H, AnalysisQuery, AnalysisService, Mode

HHMM_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_repo(request: Request) -> WindRepository:
    repo: WindRepository = request.app.state.repo
    return repo


def get_service(request: Request) -> AnalysisService:
    service: AnalysisService = request.app.state.service
    return service


SettingsDep = Annotated[Settings, Depends(get_settings)]
ServiceDep = Annotated[AnalysisService, Depends(get_service)]
RepoDep = Annotated[WindRepository, Depends(get_repo)]


def parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def analysis_query(
    *,
    settings: SettingsDep,
    service: ServiceDep,
    first_day: Annotated[
        date | None, Query(alias="from", description="First delivery day (London), inclusive")
    ] = None,
    last_day: Annotated[
        date | None, Query(alias="to", description="Last delivery day (London), inclusive")
    ] = None,
    mode: Annotated[
        Mode,
        Query(description="cutoff: latest forecast at D-1 cutoff; horizon: at a fixed lead time"),
    ] = "cutoff",
    cutoff_time: Annotated[
        str | None,
        Query(pattern=HHMM_PATTERN, description="D-1 decision cutoff, HH:MM Europe/London"),
    ] = None,
    horizon_h: Annotated[
        float, Query(ge=0, le=MAX_HORIZON_H, description="Hours before target (horizon mode)")
    ] = 24.0,
) -> AnalysisQuery:
    q = AnalysisQuery(
        first_day=first_day or settings.delivery_from,
        last_day=last_day or settings.delivery_to,
        mode=mode,
        cutoff_time=parse_hhmm(cutoff_time) if cutoff_time else settings.cutoff_time,
        horizon_h=horizon_h,
    )
    service.validate(q)
    return q


QueryDep = Annotated[AnalysisQuery, Depends(analysis_query)]


def cache_headers(response: Response, settings: SettingsDep) -> None:
    """Analysis responses depend only on the query and the data snapshot: safe to cache."""
    response.headers["Cache-Control"] = f"public, max-age={settings.cache_max_age_s}"
