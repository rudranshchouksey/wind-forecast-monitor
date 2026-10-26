"""SQLite storage for raw actuals and the full forecast publish history.

Timestamps are stored as UTC ISO-8601 text (``YYYY-MM-DDTHH:MM:SSZ``), which sorts correctly as a
string. Selection by cutoff or horizon happens at query time in the service layer, so storage never
bakes in an analytical choice.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from app.core.timeutils import format_utc, parse_utc
from app.models.records import ActualRecord, ForecastRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS actuals (
    start_time    TEXT PRIMARY KEY,
    generation_mw REAL NOT NULL,
    publish_time  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forecasts (
    publish_time  TEXT NOT NULL,
    start_time    TEXT NOT NULL,
    generation_mw REAL NOT NULL,
    PRIMARY KEY (publish_time, start_time)
);
CREATE INDEX IF NOT EXISTS ix_forecasts_start ON forecasts (start_time, publish_time);
CREATE TABLE IF NOT EXISTS ingest_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT NOT NULL,
    finished_at   TEXT NOT NULL,
    params        TEXT NOT NULL,
    actual_rows   INTEGER NOT NULL,
    forecast_rows INTEGER NOT NULL,
    status        TEXT NOT NULL
);
"""


@dataclass(frozen=True, slots=True)
class UpsertResult:
    inserted: int
    updated: int


@dataclass(frozen=True, slots=True)
class IngestRun:
    started_at: datetime
    finished_at: datetime
    params: dict[str, str]
    actual_rows: int
    forecast_rows: int
    status: str


@dataclass(frozen=True, slots=True)
class DataExtent:
    actual_rows: int
    forecast_rows: int
    publishes: int
    actuals_from: datetime | None
    actuals_to: datetime | None
    publish_from: datetime | None
    publish_to: datetime | None


class WindRepository:
    def __init__(self, path: Path, *, read_only: bool = False) -> None:
        self._path = path
        self._read_only = read_only

    @property
    def path(self) -> Path:
        return self._path

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        if self._read_only:
            # immutable=1: no journal or lock files, so it works on read-only filesystems (Vercel).
            uri = f"file:{self._path.as_posix()}?mode=ro&immutable=1"
            conn = sqlite3.connect(uri, uri=True)
        else:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self._path)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    # -- writes -------------------------------------------------------------------------------

    def upsert_actuals(self, records: Iterable[ActualRecord]) -> UpsertResult:
        """Insert actuals; on conflict keep the row with the latest publish_time (revisions win)."""
        rows = [
            (format_utc(r.start_time), r.generation_mw, format_utc(r.publish_time)) for r in records
        ]
        sql = """
            INSERT INTO actuals (start_time, generation_mw, publish_time) VALUES (?, ?, ?)
            ON CONFLICT (start_time) DO UPDATE SET
                generation_mw = excluded.generation_mw, publish_time = excluded.publish_time
            WHERE excluded.publish_time > actuals.publish_time
               OR (excluded.publish_time = actuals.publish_time
                   AND excluded.generation_mw <> actuals.generation_mw)
        """
        return self._upsert("actuals", sql, rows)

    def upsert_forecasts(self, records: Iterable[ForecastRecord]) -> UpsertResult:
        rows = [
            (format_utc(r.publish_time), format_utc(r.start_time), r.generation_mw) for r in records
        ]
        sql = """
            INSERT INTO forecasts (publish_time, start_time, generation_mw) VALUES (?, ?, ?)
            ON CONFLICT (publish_time, start_time) DO UPDATE SET
                generation_mw = excluded.generation_mw
            WHERE excluded.generation_mw <> forecasts.generation_mw
        """
        return self._upsert("forecasts", sql, rows)

    def _upsert(
        self, table: str, sql: str, rows: Sequence[tuple[str | float, ...]]
    ) -> UpsertResult:
        with self._connect() as conn:
            before = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            changes_before = conn.total_changes
            conn.executemany(sql, rows)
            touched = conn.total_changes - changes_before
            after = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        inserted = after - before
        return UpsertResult(inserted=inserted, updated=touched - inserted)

    def record_ingest_run(self, run: IngestRun) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO ingest_runs (started_at, finished_at, params, actual_rows,"
                " forecast_rows, status) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    format_utc(run.started_at),
                    format_utc(run.finished_at),
                    json.dumps(run.params, sort_keys=True),
                    run.actual_rows,
                    run.forecast_rows,
                    run.status,
                ),
            )

    # -- reads --------------------------------------------------------------------------------

    def load_actuals(self, start: datetime, end: datetime) -> pd.DataFrame:
        """Actuals with ``start <= start_time < end`` as columns start_time (UTC), generation_mw."""
        with self._connect() as conn:
            df = pd.read_sql_query(
                "SELECT start_time, generation_mw FROM actuals"
                " WHERE start_time >= ? AND start_time < ? ORDER BY start_time",
                conn,
                params=(format_utc(start), format_utc(end)),
            )
        df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
        return df

    def load_forecasts(self, target_start: datetime, target_end: datetime) -> pd.DataFrame:
        """All publishes for targets in ``[target_start, target_end)``."""
        with self._connect() as conn:
            df = pd.read_sql_query(
                "SELECT publish_time, start_time, generation_mw FROM forecasts"
                " WHERE start_time >= ? AND start_time < ? ORDER BY start_time, publish_time",
                conn,
                params=(format_utc(target_start), format_utc(target_end)),
            )
        df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
        df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
        return df

    def last_ingest(self) -> IngestRun | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT started_at, finished_at, params, actual_rows, forecast_rows, status"
                " FROM ingest_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        return IngestRun(
            started_at=parse_utc(row[0]),
            finished_at=parse_utc(row[1]),
            params=json.loads(row[2]),
            actual_rows=row[3],
            forecast_rows=row[4],
            status=row[5],
        )

    def extent(self) -> DataExtent:
        with self._connect() as conn:
            a = conn.execute(
                "SELECT COUNT(*), MIN(start_time), MAX(start_time) FROM actuals"
            ).fetchone()
            f = conn.execute(
                "SELECT COUNT(*), COUNT(DISTINCT publish_time), MIN(publish_time),"
                " MAX(publish_time) FROM forecasts"
            ).fetchone()

        def ts(v: str | None) -> datetime | None:
            return parse_utc(v) if v else None

        return DataExtent(
            actual_rows=a[0],
            forecast_rows=f[0],
            publishes=f[1],
            actuals_from=ts(a[1]),
            actuals_to=ts(a[2]),
            publish_from=ts(f[2]),
            publish_to=ts(f[3]),
        )


def utc_now() -> datetime:
    return datetime.now(UTC)
