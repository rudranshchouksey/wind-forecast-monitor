"""Map exceptions to RFC 9457 problem-details JSON."""

from __future__ import annotations

import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.clients.elexon import ElexonError
from app.models.api import ProblemDetail
from app.services.analysis import DataUnavailableError, QueryError

logger = logging.getLogger(__name__)
PROBLEM_JSON = "application/problem+json"


def problem(
    status: int, detail: str | None = None, errors: list[dict[str, object]] | None = None
) -> JSONResponse:
    body = ProblemDetail(
        title=HTTPStatus(status).phrase, status=status, detail=detail, errors=errors
    )
    return JSONResponse(
        jsonable_encoder(body, exclude_none=True), status_code=status, media_type=PROBLEM_JSON
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        return problem(422, "Request parameters failed validation.", errors)

    @app.exception_handler(QueryError)
    async def _query(_: Request, exc: QueryError) -> JSONResponse:
        return problem(400, str(exc))

    @app.exception_handler(DataUnavailableError)
    async def _no_data(_: Request, exc: DataUnavailableError) -> JSONResponse:
        return problem(503, str(exc))

    @app.exception_handler(ElexonError)
    async def _upstream(_: Request, exc: ElexonError) -> JSONResponse:
        logger.warning("upstream failure: %s", exc)
        return problem(502, "Elexon API request failed; cached data is unchanged.")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return problem(exc.status_code, str(exc.detail) if exc.detail else None)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", exc_info=exc)
        return problem(500, "Unexpected server error.")
