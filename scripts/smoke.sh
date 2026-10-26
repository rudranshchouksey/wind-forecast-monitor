#!/usr/bin/env bash
# Smoke-test the dashboard and every API endpoint against a running deployment.
#   scripts/smoke.sh http://localhost:8000          # Docker / uvicorn
#   scripts/smoke.sh http://localhost:5173          # through the Vite proxy
#   scripts/smoke.sh https://<project>.vercel.app   # production
set -uo pipefail

base="${1:-http://localhost:8000}"
base="${base%/}"
q="from=2026-01-02&to=2026-02-01&mode=cutoff&cutoff_time=09%3A20"
paths=(
  "/api/v1/health"
  "/api/v1/meta"
  "/api/v1/forecast-vs-actual?$q"
  "/api/v1/forecast-vs-actual?$q&format=csv"
  "/api/v1/metrics?$q&percentile=90&buffer_basis=total"
  "/api/v1/metrics?$q&percentile=95&buffer_basis=random"
  "/api/v1/metrics?from=2026-01-02&to=2026-02-01&mode=horizon&horizon_h=24"
  "/api/v1/metrics/correction?$q"
  "/api/v1/metrics/by-horizon?$q"
  "/api/v1/metrics/by-hour?$q"
  "/api/v1/metrics/by-day?$q"
  "/api/v1/error-distribution?$q&bin_mw=500"
  "/api/v1/diagnostics/bias?$q"
  "/api/v1/openapi.json"
)

failed=0
body="$(mktemp)"
trap 'rm -f "$body"' EXIT
for p in "${paths[@]}"; do
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 60 "$base$p" || echo 000)"
  printf '%s  %s\n' "$code" "$p"
  [[ "$code" == 200 ]] || failed=1
done

# The page itself, and a value that proves real data came back.
curl -fsS --max-time 30 "$base/" | grep -q "GB Wind Forecast Monitor" \
  && echo "200  / (dashboard HTML)" || { echo "FAIL / (dashboard HTML)"; failed=1; }
n="$(curl -fsS --max-time 60 "$base/api/v1/metrics?$q" | grep -o '"n":[0-9]*' | head -1 | cut -d: -f2)"
if [[ "${n:-0}" -gt 0 ]]; then echo "ok   metrics evaluated $n hours"; else echo "FAIL metrics n=${n:-?}"; failed=1; fi

if [[ "$failed" == 0 ]]; then echo "SMOKE OK: $base"; else echo "SMOKE FAILED: $base"; fi
exit "$failed"
