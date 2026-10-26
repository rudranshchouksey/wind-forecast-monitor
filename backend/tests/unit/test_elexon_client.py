from __future__ import annotations

import itertools
from datetime import date, timedelta

import httpx
import pytest
import respx

from app.clients.elexon import ElexonClient, ElexonError, date_chunks, datetime_chunks
from tests.conftest import utc

BASE = "https://elexon.test/bmrs/api/v1/datasets"


async def _no_sleep(_: float) -> None:
    return None


def make_client(**kwargs: object) -> ElexonClient:
    return ElexonClient(BASE, backoff_base_s=0, sleep=_no_sleep, **kwargs)  # type: ignore[arg-type]


def fuel_row(start: str, fuel: str = "WIND", gen: float = 1000) -> dict[str, object]:
    return {
        "dataset": "FUELHH",
        "publishTime": start,
        "startTime": start,
        "settlementDate": start[:10],
        "settlementPeriod": 1,
        "fuelType": fuel,
        "generation": gen,
    }


def test_date_chunks_cover_range_without_gaps_or_overlap() -> None:
    chunks = list(date_chunks(date(2026, 1, 2), date(2026, 2, 1), 7))
    assert chunks[0] == (date(2026, 1, 2), date(2026, 1, 8))
    assert chunks[-1] == (date(2026, 1, 30), date(2026, 2, 1))
    for (_, a_end), (b_start, _) in itertools.pairwise(chunks):
        assert b_start == a_end + timedelta(days=1)


def test_datetime_chunks_are_contiguous() -> None:
    chunks = list(datetime_chunks(utc(2026, 1, 1), utc(2026, 1, 10), timedelta(days=4)))
    assert chunks == [
        (utc(2026, 1, 1), utc(2026, 1, 5)),
        (utc(2026, 1, 5), utc(2026, 1, 9)),
        (utc(2026, 1, 9), utc(2026, 1, 10)),
    ]


@respx.mock
async def test_fetch_actuals_sends_documented_params_and_filters_wind() -> None:
    route = respx.get(f"{BASE}/FUELHH/stream").mock(
        return_value=httpx.Response(
            200,
            json=[fuel_row("2026-01-02T00:00:00Z"), fuel_row("2026-01-02T00:00:00Z", "CCGT")],
        )
    )
    async with make_client(chunk_days=31) as client:
        records = await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 3))
    assert len(records) == 1
    assert records[0].start_time == utc(2026, 1, 2)
    params = route.calls.last.request.url.params
    assert params["settlementDateFrom"] == "2026-01-02"
    assert params["settlementDateTo"] == "2026-01-03"
    assert params["fuelType"] == "WIND"


@respx.mock
async def test_fetch_forecasts_chunks_publish_window() -> None:
    route = respx.get(f"{BASE}/WINDFOR/stream").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "dataset": "WINDFOR",
                    "publishTime": "2026-01-01T09:30:00Z",
                    "startTime": "2026-01-02T00:00:00Z",
                    "generation": 12000,
                }
            ],
        )
    )
    async with make_client(chunk_days=7) as client:
        records = await client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 15))
    assert route.call_count == 2
    first = route.calls[0].request.url.params
    assert first["publishDateTimeFrom"] == "2026-01-01T00:00:00Z"
    assert first["publishDateTimeTo"] == "2026-01-08T00:00:00Z"
    assert records[0].generation_mw == 12000
    assert records[0].publish_time == utc(2026, 1, 1, 9, 30)


@respx.mock
async def test_retries_transient_errors_then_succeeds() -> None:
    route = respx.get(f"{BASE}/FUELHH/stream").mock(
        side_effect=[
            httpx.ConnectError("boom"),
            httpx.Response(503, headers={"Retry-After": "0"}),
            httpx.Response(200, json=[fuel_row("2026-01-02T00:30:00Z")]),
        ]
    )
    async with make_client(max_retries=3) as client:
        records = await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))
    assert route.call_count == 3
    assert len(records) == 1


@respx.mock
async def test_gives_up_after_max_retries() -> None:
    respx.get(f"{BASE}/FUELHH/stream").mock(return_value=httpx.Response(502))
    async with make_client(max_retries=2) as client:
        with pytest.raises(ElexonError, match="HTTP 502"):
            await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))


@respx.mock
async def test_transport_error_exhausted_raises_elexon_error() -> None:
    respx.get(f"{BASE}/FUELHH/stream").mock(side_effect=httpx.ReadTimeout("slow"))
    async with make_client(max_retries=1) as client:
        with pytest.raises(ElexonError, match="failed"):
            await client.fetch_wind_actuals(date(2026, 1, 2), date(2026, 1, 2))


@respx.mock
async def test_client_errors_are_not_retried() -> None:
    route = respx.get(f"{BASE}/WINDFOR/stream").mock(
        return_value=httpx.Response(400, json={"title": "bad"})
    )
    async with make_client(max_retries=5) as client:
        with pytest.raises(ElexonError, match="HTTP 400"):
            await client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))
    assert route.call_count == 1


@respx.mock
async def test_unexpected_shape_raises() -> None:
    respx.get(f"{BASE}/WINDFOR/stream").mock(
        return_value=httpx.Response(200, json={"data": "not a list"})
    )
    async with make_client() as client:
        with pytest.raises(ElexonError, match="response shape"):
            await client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))


@respx.mock
async def test_invalid_json_raises() -> None:
    respx.get(f"{BASE}/WINDFOR/stream").mock(return_value=httpx.Response(200, text="<html>"))
    async with make_client() as client:
        with pytest.raises(ElexonError, match="invalid JSON"):
            await client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))


def test_backoff_honours_retry_after_and_bounds_jitter() -> None:
    client = ElexonClient(BASE, backoff_base_s=1.0)
    assert client._backoff(3, "2.5") == 2.5
    for attempt in range(4):
        assert 0 <= client._backoff(attempt, "not-a-number") <= 2**attempt
