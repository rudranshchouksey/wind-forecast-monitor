# Developer tasks. Requires uv (https://docs.astral.sh/uv/) and Node 22.
.PHONY: help install dev dev-api dev-web ingest test test-api test-web lint format typecheck build docker-build docker-up requirements clean

FROM ?= 2025-12-25
TO   ?= 2026-02-01

help:            ## List targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

install:         ## Install backend (uv) and frontend (npm) dependencies
	cd backend && uv sync --frozen
	cd frontend && npm ci

dev:             ## Run API (:8000) and Vite dev server (:5173) together
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-web:
	cd frontend && npm run dev

ingest:          ## Fetch Elexon data into backend/data/wind.sqlite (FROM=... TO=...)
	cd backend && uv run python -m app.ingest --from $(FROM) --to $(TO)

test: test-api test-web  ## Run all tests

test-api:
	cd backend && uv run pytest --cov=app --cov-report=term

test-web:
	cd frontend && npm run test

lint:            ## Lint + format check + type check everything
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy
	cd frontend && npm run lint && npm run format:check && npm run typecheck

format:          ## Auto-format
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run format

typecheck:
	cd backend && uv run mypy
	cd frontend && npm run typecheck

build:           ## Production frontend build
	cd frontend && npm run build

docker-build:    ## Build the single-image app
	docker build -t wind-forecast-monitor:local .

docker-up:       ## docker compose up on http://localhost:8000
	docker compose up --build

requirements:    ## Regenerate requirements.txt (Vercel) from uv.lock
	cd backend && uv export --no-dev --no-hashes --no-emit-project --quiet -o ../requirements.txt

clean:
	rm -rf frontend/dist frontend/coverage backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache backend/htmlcov backend/.coverage
