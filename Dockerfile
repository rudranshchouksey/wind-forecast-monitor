# syntax=docker/dockerfile:1.7
# Single image: built React dashboard + FastAPI API + bundled data snapshot.

# ---- 1. frontend build ---------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. python dependencies (uv, from the lockfile) ----------------------------------------
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

# ---- 3. slim runtime -------------------------------------------------------------------------
FROM python:3.12-slim AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app/backend
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app backend/app ./app
COPY --chown=app:app backend/data ./data
COPY --from=frontend --chown=app:app /src/frontend/dist /app/frontend/dist
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_FRONTEND_DIST=/app/frontend/dist \
    APP_CORS_ORIGINS='[]' \
    PORT=8000
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/v1/health', timeout=4)"
# Shell form so $PORT (set by Heroku and similar hosts) is honoured.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --no-server-header
