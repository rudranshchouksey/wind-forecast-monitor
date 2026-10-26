"""Ingestion CLI.

    python -m app.ingest --from 2026-01-02 --to 2026-02-01 [--db data/wind.sqlite]

Dates are delivery days (Europe/London, inclusive). Without arguments the configured range is used,
starting ``correction_window_days + 1`` days early so the rolling bias correction has history.
Running it again is safe: rows are upserted on their natural keys.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence
from datetime import date
from pathlib import Path

from app.clients.elexon import ElexonClient, ElexonError
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.repositories.sqlite import WindRepository
from app.services.ingestion import IngestSummary, run_ingest


def parse_args(argv: Sequence[str] | None, settings: Settings) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest", description="Fetch Elexon wind data into SQLite."
    )
    parser.add_argument(
        "--from", dest="first", type=date.fromisoformat, default=settings.history_from
    )
    parser.add_argument("--to", dest="last", type=date.fromisoformat, default=settings.delivery_to)
    parser.add_argument("--db", type=Path, default=settings.database_path)
    args = parser.parse_args(argv)
    if args.last < args.first:
        parser.error("--to must be on or after --from")
    return args


def format_summary(summary: IngestSummary, db: Path) -> str:
    w = summary.window
    lines = [
        f"Ingested delivery days {w.first_day} .. {w.last_day} into {db}",
        f"  actuals:   +{summary.actuals.inserted} new, {summary.actuals.updated} revised",
        f"  forecasts: +{summary.forecasts.inserted} new, {summary.forecasts.updated} revised",
        "Data quality:",
        *(f"  - {line}" for line in summary.quality.lines()),
    ]
    return "\n".join(lines)


async def _main(args: argparse.Namespace, settings: Settings) -> IngestSummary:
    repo = WindRepository(args.db)
    async with ElexonClient.from_settings(settings) as client:
        return await run_ingest(settings, client, repo, args.first, args.last)


def main(argv: Sequence[str] | None = None) -> int:
    settings = get_settings()
    configure_logging(settings.log_level)
    args = parse_args(argv, settings)
    try:
        summary = asyncio.run(_main(args, settings))
    except ElexonError as exc:
        print(f"ingest failed: {exc}", file=sys.stderr)
        return 1
    print(format_summary(summary, args.db))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
