from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.config import Settings
from app.repositories.sqlite import WindRepository


def utc(y: int, m: int, d: int, h: int = 0, mi: int = 0, s: int = 0) -> datetime:
    return datetime(y, m, d, h, mi, s, tzinfo=UTC)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_path=tmp_path / "test.sqlite",
        elexon_base_url="https://elexon.test/bmrs/api/v1/datasets",
        http_backoff_base_s=0,
        refresh_token=None,
        _env_file=None,
    )


@pytest.fixture
def repo(settings: Settings) -> WindRepository:
    r = WindRepository(settings.database_path)
    r.init_schema()
    return r
