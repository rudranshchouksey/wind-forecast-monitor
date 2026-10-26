# Windows dev launcher (no make needed): starts the API in a new window, then Vite here.
#   powershell -ExecutionPolicy Bypass -File .\dev.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$uvBin = Join-Path $HOME ".local\bin"
if (-not (Get-Command uv -ErrorAction SilentlyContinue) -and (Test-Path $uvBin)) {
    $env:Path = "$uvBin;$env:Path"
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv not found. Install it: https://docs.astral.sh/uv/getting-started/installation/"
}

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:Path = '$uvBin;' + `$env:Path; Set-Location '$root\backend'; uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
)

Write-Host "Waiting for the API on http://127.0.0.1:8000 ..."
for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest "http://127.0.0.1:8000/api/v1/health" -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
    catch { Start-Sleep -Seconds 1 }
}

Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) { npm ci }
npm run dev
