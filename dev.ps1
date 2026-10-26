# Windows dev launcher (no make needed).
#   powershell -ExecutionPolicy Bypass -File .\dev.ps1           # API (:8000, new window, --reload) + Vite (:5173, here)
#   powershell -ExecutionPolicy Bypass -File .\dev.ps1 -Docker   # docker compose up --build, then open http://localhost:8000
param(
    [switch]$Docker,
    [switch]$NoBrowser,
    [int]$TimeoutSec = 60
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8000
$healthUrl = "http://127.0.0.1:$port/api/v1/health"

function Fail([string]$message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    exit 1
}

function Test-ApiHealthy {
    try {
        $r = Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# Name of the running compose container that publishes $port, or $null.
function Get-DockerAppOnPort {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $null }
    # Windows PowerShell turns redirected native stderr into errors; don't let that stop the script.
    $ErrorActionPreference = "Continue"
    $names = docker ps --filter "publish=$port" --format "{{.Names}}" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $names) { return $null }
    return ($names | Select-Object -First 1)
}

function Get-PortOwner {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) { return "$($proc.ProcessName) (PID $($proc.Id))" }
    return "PID $($conn.OwningProcess)"
}

function Wait-ApiHealthy([int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-ApiHealthy) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# ---------------------------------------------------------------- Docker mode
if ($Docker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail "docker not found. Install Docker Desktop, or run .\dev.ps1 without -Docker."
    }
    $ErrorActionPreference = "Continue"
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { Fail "Docker is installed but not running. Start Docker Desktop and retry." }
    $owner = Get-PortOwner
    if ($owner -and -not (Get-DockerAppOnPort)) {
        Fail "Port $port is in use by $owner (probably a local uvicorn). Close it first, then retry."
    }
    Set-Location $root
    Write-Host "Building and starting the container (first build takes a few minutes) ..."
    docker compose up --build --detach
    if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed (see output above)." }
    if (-not (Wait-ApiHealthy $TimeoutSec)) {
        docker compose logs --tail 40 app
        Fail "The container did not become healthy within $TimeoutSec s (logs above)."
    }
    Write-Host "Dashboard + API: http://localhost:$port   (API docs: /api/v1/docs)" -ForegroundColor Green
    Write-Host "Logs: docker compose logs -f app    Stop: docker compose down"
    if (-not $NoBrowser) { Start-Process "http://localhost:$port" }
    exit 0
}

# ----------------------------------------------------------------- Local mode
$uvBin = Join-Path $HOME ".local\bin"
if (-not (Get-Command uv -ErrorAction SilentlyContinue) -and (Test-Path $uvBin)) {
    $env:Path = "$uvBin;$env:Path"
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail "uv not found. Install it: https://docs.astral.sh/uv/getting-started/installation/"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm not found. Install Node 22+: https://nodejs.org/"
}

$container = Get-DockerAppOnPort
if ($container) {
    Fail ("Docker app is running on :$port (container $container) - run ``docker compose down`` " +
        "or use http://localhost:$port")
}
$owner = Get-PortOwner
$reuse = $false
if ($owner) {
    if (Test-ApiHealthy) {
        Write-Host "An API is already healthy on :$port ($owner); reusing it." -ForegroundColor Yellow
        $reuse = $true
    } else {
        Fail "Port $port is in use by $owner and it is not this API. Stop it, then retry."
    }
}

if (-not (Test-Path "$root\backend\data\wind.sqlite")) {
    Fail ("backend\data\wind.sqlite is missing. Fetch it first (under a minute):`n" +
        "  cd backend; uv run python -m app.ingest")
}

if (-not $reuse) {
    # Install dependencies here, so the health timeout below only covers server start-up.
    Write-Host "Syncing backend dependencies (uv) ..."
    Push-Location "$root\backend"
    uv sync --frozen
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail "uv sync failed (see output above)." }

    $api = Start-Process powershell -PassThru -ArgumentList @(
        "-NoExit", "-Command",
        "`$env:Path = '$uvBin;' + `$env:Path; Set-Location '$root\backend'; " +
        "uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $port"
    )
    Write-Host "Waiting up to $TimeoutSec s for the API on $healthUrl ..."
    if (-not (Wait-ApiHealthy $TimeoutSec)) {
        Fail ("The API did not become healthy within $TimeoutSec s. Check the API window " +
            "(PID $($api.Id)) for the error; Vite was not started.")
    }
    Write-Host "API is healthy." -ForegroundColor Green
}

Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed (see output above)." }
}
npm run dev
