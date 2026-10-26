# ADR 0003: Deploy to Vercel (static build + one Python function); Docker image as fallback

- Status: accepted
- Date: 2026-10-26

## Context
Reviewers need a public link that loads quickly and costs nothing to keep running. The API is
read-only over a 4.3 MB SQLite snapshot.

## Decision
**Vercel**:
- The Vite build is served from Vercel's CDN (`frontend/dist`).
- `api/index.py` exposes the FastAPI app as a single Python function; `vercel.json` rewrites
  `/api/(.*)` to it and bundles `backend/app` and `backend/data`.
- Dependencies come from `requirements.txt`, generated from `uv.lock` (CI fails if they drift).
- The database is opened read-only and the refresh endpoint is disabled.

The bundle size was measured early, as required: the Linux runtime dependencies come to **116 MB
unzipped** (pandas 45 MB, numpy 57 MB), well under Vercel's 250 MB function limit.

## Alternatives
- **Heroku (container stack)**: the single Docker image works as-is (`heroku.yml`, `$PORT`
  honoured), but Heroku has no free tier, so a reviewer link would need a paid dyno. Kept as the
  documented fallback.
- **Fly.io / Render / Cloud Run**: also run the same image; a fine next step if write access
  (scheduled refresh) is needed.

## Consequences
- Free, CDN-fast frontend; API cold starts of ~1–2 s, then warm responses in milliseconds.
- No scheduled refresh on Vercel (read-only filesystem). Refreshing means re-running ingest and redeploying.
- Same code paths in every environment: `create_app()` is used by uvicorn, Docker and Vercel.
