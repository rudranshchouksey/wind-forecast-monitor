"""API response schemas (the public contract, documented in OpenAPI at /docs)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProblemDetail(BaseModel):
    """RFC 9457 problem details, used by every error response."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    errors: list[dict[str, object]] | None = None


class QueryEcho(_Out):
    first_day: date = Field(serialization_alias="from")
    last_day: date = Field(serialization_alias="to")
    mode: Literal["cutoff", "horizon"]
    cutoff_time: str = Field(description="Decision cutoff, HH:MM Europe/London on D-1")
    horizon_h: float | None = Field(description="Only set in horizon mode")


class Coverage(_Out):
    expected_hours: int
    with_forecast: int
    with_actual: int
    evaluated: int
    ratio: float


class DirectionalStats(_Out):
    n: int
    share: float | None
    mean_mw: float | None
    p50_mw: float | None
    p90_mw: float | None
    p99_mw: float | None
    max_mw: float | None


class ErrorMetrics(_Out):
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None = Field(
        description="Mean of forecast - actual; > 0 means forecasts ran high"
    )
    mape_pct: float | None
    mape_n: int
    mape_min_actual_mw: float
    abs_p50_mw: float | None
    abs_p90_mw: float | None
    abs_p99_mw: float | None
    shortfall: DirectionalStats = Field(description="Hours where actual wind < forecast")
    surplus: DirectionalStats = Field(description="Hours where actual wind > forecast")


class Insight(_Out):
    percentile: float
    n: int
    buffer_mw: float | None
    achieved_coverage: float | None
    offset_mw: float | None
    random_component_mw: float | None
    headline: str
    detail: str
    caveat: str | None


class MetricsResponse(BaseModel):
    query: QueryEcho
    metrics: ErrorMetrics
    coverage: Coverage
    insight: Insight
    mean_horizon_h: float | None


class SeriesPoint(BaseModel):
    target_time: datetime
    actual_mw: float
    forecast_mw: float
    error_mw: float
    publish_time: datetime
    horizon_h: float


class SeriesResponse(BaseModel):
    query: QueryEcho
    coverage: Coverage
    points: list[SeriesPoint]


class HorizonRow(BaseModel):
    horizon_h: float
    metrics: ErrorMetrics
    coverage: Coverage


class HorizonResponse(BaseModel):
    query: QueryEcho
    rows: list[HorizonRow]
    reference: HorizonRow = Field(description="Cutoff-mode result; horizon_h is its mean horizon")


class GroupRow(BaseModel):
    key: str
    metrics: ErrorMetrics


class GroupedResponse(BaseModel):
    query: QueryEcho
    group_by: Literal["hour", "day"]
    rows: list[GroupRow]


class HistogramBin(BaseModel):
    lower_mw: float
    upper_mw: float
    count: int


class DistributionResponse(BaseModel):
    query: QueryEcho
    n: int
    bin_width_mw: float
    bins: list[HistogramBin]
    quantiles: dict[str, float]


class BiasBucket(_Out):
    label: str
    n: int
    bias_mw: float | None
    mean_ratio: float | None = Field(description="Mean of actual / forecast")


class BiasDiagnosticsResponse(BaseModel):
    query: QueryEcho
    overall_bias_mw: float | None
    bias_at_zero_horizon_mw: float | None
    hindcast: BiasBucket
    by_forecast_level: list[BiasBucket]


class DataStatus(BaseModel):
    first_day: date
    last_day: date
    actual_rows: int
    forecast_rows: int
    publishes: int
    actuals_from: datetime | None
    actuals_to: datetime | None
    publish_from: datetime | None
    publish_to: datetime | None
    last_ingest_at: datetime | None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    data: DataStatus | None
    detail: str | None = None


class CutoffPreset(BaseModel):
    label: str
    time: str
    description: str


class MetaResponse(BaseModel):
    first_day: date
    last_day: date
    timezone: str
    default_cutoff_time: str
    cutoff_presets: list[CutoffPreset]
    max_horizon_h: float
    default_horizons: list[float]
    default_percentile: float
    alignment: str
    mape_min_actual_mw: float


class RefreshResponse(BaseModel):
    actuals_inserted: int
    actuals_updated: int
    forecasts_inserted: int
    forecasts_updated: int
    quality: list[str]
