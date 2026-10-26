"""Async client for the Elexon BMRS Insights API (no key required).

Endpoints, parameters and limits were verified against the live API; see docs/data-notes.md.
Requests are split into chunks so each one stays small and can be retried on its own.
Transient failures (network errors, 429, 5xx) are retried with exponential backoff and jitter.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable, Iterator
from datetime import date, datetime, timedelta
from types import TracebackType
from typing import Any, Self

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.config import Settings
from app.core.timeutils import format_utc
from app.models.records import ActualRecord, ForecastRecord, FuelHHRow, WindForRow

logger = logging.getLogger(__name__)

WIND_FUEL_TYPE = "WIND"
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_fuelhh_rows = TypeAdapter(list[FuelHHRow])
_windfor_rows = TypeAdapter(list[WindForRow])


class ElexonError(RuntimeError):
    """Raised when the Elexon API cannot be reached or returns an unusable response."""


def date_chunks(first: date, last: date, days: int) -> Iterator[tuple[date, date]]:
    """Split the inclusive date range into inclusive chunks of at most ``days`` days."""
    cur = first
    while cur <= last:
        end = min(cur + timedelta(days=days - 1), last)
        yield cur, end
        cur = end + timedelta(days=1)


def datetime_chunks(
    start: datetime, end: datetime, span: timedelta
) -> Iterator[tuple[datetime, datetime]]:
    """Split ``[start, end]`` into consecutive windows of at most ``span``.

    Elexon's bounds are inclusive, so neighbouring windows can share a boundary row. Callers
    de-duplicate on natural keys, so the overlap is harmless and nothing is missed.
    """
    cur = start
    while cur < end:
        nxt = min(cur + span, end)
        yield cur, nxt
        cur = nxt


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout_s: float = 30.0,
        max_retries: int = 4,
        backoff_base_s: float = 0.5,
        max_concurrency: int = 4,
        chunk_days: int = 7,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/",
            timeout=httpx.Timeout(timeout_s),
            headers={"Accept": "application/json", "User-Agent": "wind-forecast-monitor/1.0"},
            transport=transport,
        )
        self._max_retries = max_retries
        self._backoff_base_s = backoff_base_s
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._chunk_days = chunk_days
        self._sleep = sleep

    @classmethod
    def from_settings(cls, settings: Settings, **kwargs: Any) -> ElexonClient:
        return cls(
            settings.elexon_base_url,
            timeout_s=settings.http_timeout_s,
            max_retries=settings.http_max_retries,
            backoff_base_s=settings.http_backoff_base_s,
            max_concurrency=settings.http_max_concurrency,
            chunk_days=settings.ingest_chunk_days,
            **kwargs,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # -- public API ---------------------------------------------------------------------------

    async def fetch_wind_actuals(self, first: date, last: date) -> list[ActualRecord]:
        """Half-hourly WIND outturn for settlement dates ``first..last`` (inclusive)."""
        chunks = list(date_chunks(first, last, self._chunk_days))
        payloads = await asyncio.gather(
            *(
                self._get_json(
                    "FUELHH/stream",
                    {
                        "settlementDateFrom": a.isoformat(),
                        "settlementDateTo": b.isoformat(),
                        "fuelType": WIND_FUEL_TYPE,
                    },
                )
                for a, b in chunks
            )
        )
        records: list[ActualRecord] = []
        for payload in payloads:
            rows = self._validate(_fuelhh_rows, payload, "FUELHH")
            records.extend(
                ActualRecord(r.start_time, r.generation, r.publish_time)
                for r in rows
                if r.fuel_type == WIND_FUEL_TYPE
            )
        logger.info("fetched actuals rows=%d chunks=%d", len(records), len(chunks))
        return records

    async def fetch_wind_forecasts(
        self, publish_from: datetime, publish_to: datetime
    ) -> list[ForecastRecord]:
        """Every WINDFOR publish with ``publish_from <= publishTime <= publish_to``."""
        windows = list(datetime_chunks(publish_from, publish_to, timedelta(days=self._chunk_days)))
        payloads = await asyncio.gather(
            *(
                self._get_json(
                    "WINDFOR/stream",
                    {"publishDateTimeFrom": format_utc(a), "publishDateTimeTo": format_utc(b)},
                )
                for a, b in windows
            )
        )
        records: list[ForecastRecord] = []
        for payload in payloads:
            rows = self._validate(_windfor_rows, payload, "WINDFOR")
            records.extend(ForecastRecord(r.publish_time, r.start_time, r.generation) for r in rows)
        logger.info("fetched forecast rows=%d chunks=%d", len(records), len(windows))
        return records

    # -- internals ----------------------------------------------------------------------------

    @staticmethod
    def _validate[T](adapter: TypeAdapter[list[T]], payload: Any, dataset: str) -> list[T]:
        try:
            return adapter.validate_python(payload)
        except ValidationError as exc:
            raise ElexonError(f"unexpected {dataset} response shape: {exc}") from exc

    def _backoff(self, attempt: int, retry_after: str | None) -> float:
        if retry_after is not None:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                pass
        # Full jitter: uniform in [0, base * 2^attempt]; not used for security.
        return random.uniform(0, self._backoff_base_s * 2**attempt)

    async def _get_json(self, path: str, params: dict[str, str]) -> Any:
        async with self._semaphore:
            for attempt in range(self._max_retries + 1):
                last_try = attempt == self._max_retries
                try:
                    response = await self._http.get(path, params=params)
                except httpx.TransportError as exc:
                    if last_try:
                        raise ElexonError(f"GET {path} failed: {exc!r}") from exc
                    delay = self._backoff(attempt, None)
                    logger.warning("transport error path=%s attempt=%d err=%r", path, attempt, exc)
                else:
                    if response.status_code < 400:
                        try:
                            return response.json()
                        except ValueError as exc:
                            raise ElexonError(f"GET {path} returned invalid JSON") from exc
                    if response.status_code not in _RETRYABLE_STATUS or last_try:
                        raise ElexonError(
                            f"GET {path} -> HTTP {response.status_code}: {response.text[:300]}"
                        )
                    delay = self._backoff(attempt, response.headers.get("Retry-After"))
                    logger.warning(
                        "retryable status path=%s status=%d attempt=%d",
                        path,
                        response.status_code,
                        attempt,
                    )
                await self._sleep(delay)
        raise AssertionError("unreachable")  # pragma: no cover
