"""Application settings, loaded from environment variables (prefix ``APP_``) and ``.env``."""

from __future__ import annotations

from datetime import date, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "wind.sqlite"

Alignment = Literal["hour_mean", "point"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Storage
    database_path: Path = DEFAULT_DB_PATH
    database_read_only: bool = False

    # Elexon client
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
    http_timeout_s: float = Field(default=30.0, gt=0)
    http_max_retries: int = Field(default=4, ge=0, le=10)
    http_backoff_base_s: float = Field(default=0.5, ge=0)
    http_max_concurrency: int = Field(default=4, ge=1, le=16)
    ingest_chunk_days: int = Field(default=7, ge=1, le=31)

    # Analysis scope (delivery days, Europe/London calendar dates, inclusive)
    delivery_from: date = date(2026, 1, 2)
    delivery_to: date = date(2026, 2, 1)
    timezone: str = "Europe/London"
    # Earliest GB day-ahead gate closure (EPEX GB hourly auction). See docs/adr/0002.
    cutoff_time: time = time(9, 20)
    # Forecasts are kept this far before the first cutoff so long-horizon analysis is possible.
    forecast_lookback_hours: int = Field(default=72, ge=0, le=168)
    alignment: Alignment = "hour_mean"
    mape_min_actual_mw: float = Field(default=1000.0, ge=0)
    default_percentile: float = Field(default=90.0, ge=50, le=99.9)
    # Bias correction: fit on this many complete past delivery days (D-8 .. D-2 for 7).
    correction_window_days: int = Field(default=7, ge=3, le=28)

    # API
    cors_origins: list[str] = ["http://localhost:5173"]
    cache_max_age_s: int = Field(default=300, ge=0)
    refresh_token: SecretStr | None = None
    frontend_dist: Path | None = None
    log_level: str = "INFO"

    @property
    def history_from(self) -> date:
        """First day stored: enough history before delivery_from for the bias-correction window."""
        return self.delivery_from - timedelta(days=self.correction_window_days + 1)

    @model_validator(mode="after")
    def _range_ordered(self) -> Settings:
        if self.delivery_to < self.delivery_from:
            raise ValueError("delivery_to must be on or after delivery_from")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
