"""Analysis endpoints. Handlers are sync because the work is CPU-bound pandas (it runs in the
threadpool); results are memoised in the service and marked cacheable for clients and CDNs."""

from __future__ import annotations

import math
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api.deps import QueryDep, ServiceDep, SettingsDep, cache_headers
from app.api.v1.mappers import coverage, query_echo
from app.core.timeutils import LONDON
from app.models import api
from app.services.analysis import DEFAULT_HORIZONS, MAX_HORIZON_H, AnalysisQuery, QueryError
from app.services.insight import BufferBasis

router = APIRouter(tags=["analysis"], dependencies=[Depends(cache_headers)])

PercentileDep = Annotated[
    float | None, Query(ge=50, le=99, description="Coverage target for the buffer, %")
]


@router.get(
    "/forecast-vs-actual",
    response_model=api.SeriesResponse,
    summary="Hourly actual vs selected forecast",
    responses={200: {"content": {"text/csv": {}}, "description": "JSON, or CSV with format=csv"}},
)
def forecast_vs_actual(
    q: QueryDep,
    service: ServiceDep,
    format: Annotated[Literal["json", "csv"], Query()] = "json",
) -> api.SeriesResponse | Response:
    ev = service.evaluate(q)
    frame = service.series(q)
    if format == "csv":
        out = frame.assign(target_time_london=frame["target_time"].dt.tz_convert(LONDON))
        out = out[
            ["target_time", "target_time_london", "actual_mw", "forecast_mw", "error_mw",
             "publish_time", "horizon_h", "corrected_mw"]
        ]  # fmt: skip
        csv = out.to_csv(index=False, float_format="%.1f", date_format="%Y-%m-%dT%H:%M:%S%z")
        name = f"wind-forecast-vs-actual_{q.first_day}_{q.last_day}_{q.mode}.csv"
        return Response(
            csv,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )
    points = [
        api.SeriesPoint(
            target_time=r.target_time,
            actual_mw=r.actual_mw,
            forecast_mw=r.forecast_mw,
            error_mw=r.error_mw,
            publish_time=r.publish_time,
            horizon_h=r.horizon_h,
            corrected_mw=_optional_float(r.corrected_mw),
        )
        for r in frame.itertuples(index=False)
    ]
    return api.SeriesResponse(query=query_echo(q), coverage=coverage(ev.coverage), points=points)


@router.get("/metrics", response_model=api.MetricsResponse, summary="Headline error metrics")
def metrics(
    q: QueryDep,
    service: ServiceDep,
    settings: SettingsDep,
    percentile: PercentileDep = None,
    buffer_basis: Annotated[
        BufferBasis,
        Query(description="total: include the persistent offset; random: de-biased error only"),
    ] = "total",
) -> api.MetricsResponse:
    res = service.metrics(q, percentile or settings.default_percentile, buffer_basis)
    return api.MetricsResponse(
        query=query_echo(q),
        metrics=api.ErrorMetrics.model_validate(res.metrics),
        coverage=coverage(res.coverage),
        insight=api.Insight.model_validate(res.insight),
        mean_horizon_h=res.mean_horizon_h,
    )


def _parse_horizons(raw: str | None) -> list[float]:
    if not raw:
        return list(DEFAULT_HORIZONS)
    try:
        values = [float(x) for x in raw.split(",") if x.strip()]
    except ValueError as exc:
        raise ValueError("horizons must be a comma-separated list of numbers") from exc
    if not values or len(values) > 24 or any(not 0 <= v <= MAX_HORIZON_H for v in values):
        raise ValueError(f"horizons must be 1-24 values between 0 and {MAX_HORIZON_H:g}")
    return values


@router.get(
    "/metrics/by-horizon",
    response_model=api.HorizonResponse,
    summary="Accuracy as a function of forecast lead time",
)
def metrics_by_horizon(
    q: QueryDep,
    service: ServiceDep,
    horizons: Annotated[
        str | None, Query(description="Comma-separated hours, e.g. 1,4,12,24,48")
    ] = None,
) -> api.HorizonResponse:
    try:
        hs = _parse_horizons(horizons)
    except ValueError as exc:
        raise QueryError(str(exc)) from exc
    rows = [
        api.HorizonRow(
            horizon_h=r.horizon_h,
            metrics=api.ErrorMetrics.model_validate(r.metrics),
            coverage=coverage(r.coverage),
        )
        for r in service.by_horizon(q, hs)
    ]
    cutoff_q = AnalysisQuery(q.first_day, q.last_day, "cutoff", q.cutoff_time)
    ref = service.metrics(cutoff_q, 90)
    reference = api.HorizonRow(
        horizon_h=ref.mean_horizon_h or 0.0,
        metrics=api.ErrorMetrics.model_validate(ref.metrics),
        coverage=coverage(ref.coverage),
    )
    return api.HorizonResponse(query=query_echo(q), rows=rows, reference=reference)


@router.get(
    "/metrics/by-hour",
    response_model=api.GroupedResponse,
    summary="Error by hour of day (Europe/London)",
)
def metrics_by_hour(q: QueryDep, service: ServiceDep) -> api.GroupedResponse:
    rows = [
        api.GroupRow(key=g.key, metrics=api.ErrorMetrics.model_validate(g.metrics))
        for g in service.by_hour(q)
    ]
    return api.GroupedResponse(query=query_echo(q), group_by="hour", rows=rows)


@router.get("/metrics/by-day", response_model=api.GroupedResponse, summary="Error by delivery day")
def metrics_by_day(q: QueryDep, service: ServiceDep) -> api.GroupedResponse:
    rows = [
        api.GroupRow(key=g.key, metrics=api.ErrorMetrics.model_validate(g.metrics))
        for g in service.by_day(q)
    ]
    return api.GroupedResponse(query=query_echo(q), group_by="day", rows=rows)


@router.get(
    "/error-distribution",
    response_model=api.DistributionResponse,
    summary="Histogram of signed error (forecast - actual)",
)
def error_distribution(
    q: QueryDep,
    service: ServiceDep,
    bin_mw: Annotated[float, Query(ge=50, le=5000, description="Bin width in MW")] = 500,
) -> api.DistributionResponse:
    d = service.distribution(q, bin_mw)
    edges = d.histogram.edges
    bins = [
        api.HistogramBin(lower_mw=lo, upper_mw=hi, count=c)
        for lo, hi, c in zip(edges[:-1], edges[1:], d.histogram.counts, strict=True)
    ]
    return api.DistributionResponse(
        query=query_echo(q), n=d.n, bin_width_mw=bin_mw, bins=bins, quantiles=d.quantiles
    )


@router.get(
    "/diagnostics/bias",
    response_model=api.BiasDiagnosticsResponse,
    summary="Is the bias forecast error or a systematic offset?",
)
def bias_diagnostics(q: QueryDep, service: ServiceDep) -> api.BiasDiagnosticsResponse:
    d = service.bias_diagnostics(q)
    return api.BiasDiagnosticsResponse(
        query=query_echo(q),
        overall_bias_mw=d.overall_bias_mw,
        bias_at_zero_horizon_mw=d.bias_at_zero_horizon_mw,
        hindcast=api.BiasBucket.model_validate(d.hindcast),
        by_forecast_level=[api.BiasBucket.model_validate(b) for b in d.by_forecast_level],
        by_actual_level=[api.BiasBucket.model_validate(b) for b in d.by_actual_level],
        hindcast_by_level=[api.BiasBucket.model_validate(b) for b in d.hindcast_by_level],
        hindcast_by_actual_level=[
            api.BiasBucket.model_validate(b) for b in d.hindcast_by_actual_level
        ],
    )


def _optional_float(value: object) -> float | None:
    number = float(cast(float, value))
    return None if math.isnan(number) else number


def _pct_change(before: float | None, after: float | None) -> float | None:
    if before is None or after is None or before == 0:
        return None
    return (after - before) / before * 100


@router.get(
    "/metrics/correction",
    response_model=api.CorrectionResponse,
    summary="Raw vs rolling bias-corrected forecast accuracy (cutoff mode)",
)
def correction(q: QueryDep, service: ServiceDep) -> api.CorrectionResponse:
    res = service.correction(q)
    fit = res.latest_fit
    return api.CorrectionResponse(
        query=query_echo(q),
        method=(
            f"OLS actual = a * forecast + b, refitted per delivery day D on the {res.window_days} "
            f"complete days D-{res.window_days + 1}..D-2 known at the D-1 cutoff"
        ),
        window_days=res.window_days,
        days_total=res.days_total,
        days_corrected=res.days_corrected,
        raw=api.ErrorMetrics.model_validate(res.raw),
        corrected=api.ErrorMetrics.model_validate(res.corrected),
        mae_change_pct=_pct_change(res.raw.mae_mw, res.corrected.mae_mw),
        rmse_change_pct=_pct_change(res.raw.rmse_mw, res.corrected.rmse_mw),
        latest_fit=None
        if fit is None
        else api.CorrectionFit(
            day=fit.day,
            slope=fit.slope,
            intercept=fit.intercept,
            train_hours=fit.train_hours,
            train_first_day=fit.train_first_day,
            train_last_day=fit.train_last_day,
        ),
    )
