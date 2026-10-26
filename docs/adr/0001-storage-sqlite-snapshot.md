# ADR 0001: Store the raw publish history in a bundled SQLite snapshot

- Status: accepted
- Date: 2026-10-26

## Context
The app must serve quickly and keep working when Elexon is down. The January 2026 dataset is small:
1,872 half-hourly actuals and 24,893 forecast rows from 341 WINDFOR publishes (January plus 8 history
days for the bias correction), about 4.3 MB.
Analysts need to change the cutoff and the lead time freely, so selection must not be baked in at ingest time.

## Decision
- An ingestion CLI (`python -m app.ingest`) writes **raw, de-duplicated rows** into SQLite:
  `actuals(start_time PK)` and `forecasts(publish_time, start_time PK)`, plus an `ingest_runs` audit table.
- All selection (cutoff or horizon), alignment and metrics run **at query time** in pandas over an
  in-memory copy loaded once per process, with an LRU cache per query.
- The snapshot file is committed and shipped with every deployment. Serverless instances open it
  with `mode=ro&immutable=1`, so no journal or lock files are needed on a read-only filesystem.

## Alternatives
- **Parquet**: columnar and fast, but idempotent upserts and an audit table are clumsy, and it brings
  pyarrow (~100 MB) into the serverless bundle.
- **Postgres**: right for multi-year, multi-writer use, but it adds a service to run and pay for
  and a new failure mode, with no benefit at 25k rows.
- **Pre-computing results**: fast, but it fixes the cutoff and the horizons, which is exactly what users want to vary.

## Consequences
- Zero runtime dependency on Elexon; a cold start reads ~4 MB.
- Refreshing the deployed demo means re-running ingest and redeploying (or `POST /admin/refresh`
  on a writable host). That is acceptable for a historical analysis.
- Upserts on natural keys make ingestion idempotent; revised actuals (a later `publishTime`) win.
