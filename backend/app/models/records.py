"""Domain records and the Elexon wire formats they are parsed from."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class _ElexonRow(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True, frozen=True)

    publish_time: AwareDatetime = Field(alias="publishTime")
    start_time: AwareDatetime = Field(alias="startTime")
    generation: float

    @field_validator("publish_time", "start_time")
    @classmethod
    def _to_utc(cls, v: datetime) -> datetime:
        return v.astimezone(UTC)


class FuelHHRow(_ElexonRow):
    """One row of ``FUELHH/stream`` (half-hourly outturn by fuel type)."""

    fuel_type: str = Field(alias="fuelType")


class WindForRow(_ElexonRow):
    """One row of ``WINDFOR/stream`` (hourly wind forecast, one row per target per publish)."""


@dataclass(frozen=True, slots=True)
class ActualRecord:
    start_time: datetime
    generation_mw: float
    publish_time: datetime


@dataclass(frozen=True, slots=True)
class ForecastRecord:
    publish_time: datetime
    start_time: datetime
    generation_mw: float
