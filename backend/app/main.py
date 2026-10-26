"""Application factory.

    uvicorn app.main:app --reload

If ``APP_FRONTEND_DIST`` points at a built frontend, it is served from ``/`` (the single Docker
image does this). On Vercel the CDN serves the frontend and only ``/api`` reaches this app.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.errors import install_error_handlers
from app.api.v1 import analysis, system
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.repositories.sqlite import WindRepository
from app.services.analysis import AnalysisService

logger = logging.getLogger("app.access")
API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "starting db=%s read_only=%s", settings.database_path, settings.database_read_only
        )
        yield

    app = FastAPI(
        title="GB Wind Forecast Monitor",
        version=__version__,
        description=(
            "Accuracy of the Elexon WINDFOR national wind forecast against FUELHH outturn, "
            "evaluated at the day-ahead decision cutoff. All times are UTC in responses; "
            "delivery days and cutoffs are Europe/London."
        ),
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    repo = WindRepository(settings.database_path, read_only=settings.database_read_only)
    app.state.settings = settings
    app.state.repo = repo
    app.state.service = AnalysisService(repo, settings)

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def access_log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        logger.info(
            "method=%s path=%s status=%d ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - start) * 1000,
        )
        return response

    install_error_handlers(app)
    app.include_router(system.router, prefix=API_PREFIX)
    app.include_router(analysis.router, prefix=API_PREFIX)

    dist = settings.frontend_dist
    if dist is not None and (dist / "index.html").exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
