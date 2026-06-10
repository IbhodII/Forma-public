# Health Dashboard - API + React
# Double-click: start.bat / start.vbs
#
#   .\start.ps1
#   .\start.ps1 -Source     # dev из исходников (start.vbs); без Forma backend.exe
#   .\start.ps1 -Stop
#   .\start.ps1 -Install
#   .\start.ps1 -NoBrowser
#   .\start.ps1 -NoRestart
#   .\start.ps1 -MobileLan
#   .\start.ps1 -BindApiHost 0.0.0.0 -OpenFirewall

param(
    [switch]$Install,
    [switch]$NoBrowser,
    [switch]$Stop,
    [switch]$NoRestart,
    [switch]$DesktopLan,
    [switch]$SkipApiPortConfig,
    [switch]$OpenFirewall,
    [switch]$MobileLan,
    [switch]$Source,
    [string]$BindApiHost = "127.0.0.1"
)

if ($MobileLan) {
    $BindApiHost = "0.0.0.0"
}

# Запуск из десктопного приложения Forma: только Vite, не трогать встроенный API и не перезаписывать .api-port.
if ($DesktopLan) {
    $NoBrowser = $true
    $NoRestart = $true
    $SkipApiPortConfig = $true
}

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Python = Join-Path $Root "venv/Scripts/python.exe"
$FrontendDir = Join-Path $Root "frontend"
$LogsDir = Join-Path $Root "backend/logs"
$FrontendUrl = "http://127.0.0.1:5173"
$ApiPortPreferred = 8000
$ApiPortFallback = 8002
$ApiPort = $ApiPortPreferred
$FrontendPort = 5173
$UvicornDevScript = Join-Path $Root "scripts\UvicornDev.ps1"

function Write-Info([string]$Message) {
    Write-Host "[Health Dashboard] $Message" -ForegroundColor Cyan
}

function Write-Warn([string]$Message) {
    Write-Host "[Health Dashboard] $Message" -ForegroundColor Yellow
}

function Get-ListeningPids([int]$Port) {
    $seen = @{}
    try {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            ForEach-Object {
                $pidVal = [int]$_.OwningProcess
                if ($pidVal -gt 0) { $seen[$pidVal] = $true }
            }
    } catch {
        $portTag = ":$Port"
        $netstat = netstat -ano 2>$null
        if ($netstat) {
            foreach ($line in $netstat) {
                $text = "$line"
                if ($text -notmatch "LISTENING") { continue }
                if ($text -notmatch [regex]::Escape($portTag)) { continue }
                $parts = ($text -replace '\s+', ' ').Trim().Split(' ')
                if ($parts.Length -ge 5) {
                    $pidVal = [int]$parts[-1]
                    if ($pidVal -gt 0) { $seen[$pidVal] = $true }
                }
            }
        }
    }
    return @($seen.Keys)
}

function Get-ActiveListeningPids([int]$Port) {
    @(Get-ListeningPids $Port | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
}

function Stop-ProcessTree([int]$ProcessId) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        return $false
    }
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & taskkill.exe /PID $ProcessId /F /T 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Stop-ProjectUvicornWorkers() {
    $rootPat = [regex]::Escape($Root)
    Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match $rootPat -and
            $_.CommandLine -match "uvicorn" -and
            $_.CommandLine -match "backend\.main"
        } |
        ForEach-Object {
            $procId = [int]$_.ProcessId
            if (Stop-ProcessTree $procId) {
                Write-Info "Stopped API worker (PID $procId)"
            }
        }
}

function Stop-AllUvicornBackendMain() {
    Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match "uvicorn" -and
            $_.CommandLine -match "backend\.main"
        } |
        ForEach-Object {
            $procId = [int]$_.ProcessId
            if (Stop-ProcessTree $procId) {
                Write-Info "Stopped uvicorn backend.main (PID $procId)"
            }
        }
}

function Test-IsFormaEmbeddedBackend([int]$ProcessId) {
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
        if (-not $proc) {
            $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
            return ($null -ne $p -and $p.ProcessName -ieq "backend")
        }
        if ($proc.Name -ieq "backend.exe") { return $true }
        $cmd = [string]$proc.CommandLine
        if ($cmd -match "FORMA_" -and $cmd -notmatch "uvicorn") { return $true }
        return $false
    } catch {
        return $false
    }
}

function Stop-FormaPackagedBackend() {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & taskkill.exe /IM backend.exe /F /T 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Stopped Forma packaged backend.exe"
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Wait-PortFree([int]$Port, [int]$TimeoutSec = 15) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ((Get-ActiveListeningPids $Port).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 350
    }
    return $false
}

function Stop-Port([int]$Port, [string]$Label) {
    if ($Port -eq $ApiPort) {
        Stop-ProjectUvicornWorkers
    }

    $staleWarned = $false
    for ($try = 0; $try -lt 4; $try++) {
        $pids = @(Get-ActiveListeningPids $Port)
        if ($pids.Count -eq 0) {
            $ghost = @(Get-ListeningPids $Port | Where-Object {
                -not (Get-Process -Id $_ -ErrorAction SilentlyContinue)
            })
            if ($ghost.Count -gt 0 -and -not $staleWarned) {
                Write-Warn "Port ${Port}: stale netstat PID $($ghost -join ', ') (process already exited). Continuing."
                $staleWarned = $true
            }
            return
        }

        foreach ($procId in $pids) {
            if ($DesktopLan -and -not $Source -and (Test-IsFormaEmbeddedBackend $procId)) {
                Write-Info "Keeping Forma embedded API (PID $procId, port $Port)"
                continue
            }
            if (Stop-ProcessTree $procId) {
                Write-Info "Stopped $Label (PID $procId, port $Port)"
            } else {
                Write-Warn "Could not stop PID $procId on port $Port (try as Administrator?)"
            }
        }
        Start-Sleep -Milliseconds 600
    }

    $left = @(Get-ActiveListeningPids $Port)
    if ($left.Count -gt 0) {
        Write-Warn "Port $Port still in use. PIDs: $($left -join ', '). Run: .\start.ps1 -Stop"
    }
}

function Test-ApiHealthReady([int]$Port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 3
        return ($null -ne $health.status)
    } catch {
        return $false
    }
}

function Test-ApiHasRequiredRoutes([int]$Port) {
    try {
        $openapi = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/openapi.json" -TimeoutSec 5
        $paths = $openapi.paths.PSObject.Properties.Name
        $required = @(
            "/api/strength/sessions/{date}/{workout_title}/heart-rate",
            "/api/strength/{workout_id}/heart-rate",
            "/api/nutrition/cut/deficit-control",
            "/api/nutrition/forecast/dynamic",
            "/api/nutrition/forecast"
        )
        foreach ($route in $required) {
            if ($paths -notcontains $route) {
                return $false
            }
        }
        return $true
    } catch {
        return $false
    }
}

function Test-PortServesCurrentApi([int]$Port) {
    return (Test-ApiHealthReady $Port) -and (Test-ApiHasRequiredRoutes $Port)
}

function Resolve-ApiPort() {
    $preferred = $ApiPortPreferred
    $fallback = $ApiPortFallback
    if ($DesktopLan) {
        foreach ($port in @($fallback, $preferred)) {
            if (Test-PortServesCurrentApi $port) {
                Write-Info "Desktop LAN: using existing API on port $port (Forma or dev server)."
                $script:SkipApiStart = $true
                return $port
            }
            if (Test-ApiHealthReady $port) {
                Write-Info "Desktop LAN: API on port $port is healthy."
                $script:SkipApiStart = $true
                return $port
            }
        }
    }
    foreach ($port in @($preferred, $fallback)) {
        if (Test-PortServesCurrentApi $port) {
            Write-Info "Port $port already serves the current API."
            $script:SkipApiStart = $true
            return $port
        }
        if (Test-ApiHealthReady $port) {
            Write-Warn "Port $port responds but is an outdated API build (missing nutrition/deficit routes). Will restart."
        }
    }
    $script:SkipApiStart = $false
    if (@(Get-ListeningPids $preferred).Count -eq 0) {
        return $preferred
    }
    $alive = @(Get-ActiveListeningPids $preferred)
    if ($alive.Count -eq 0) {
        Write-Warn "Port $preferred looks stuck (zombie listener). Trying to free it..."
        foreach ($ghostPid in @(Get-ListeningPids $preferred)) {
            Stop-ProcessTree $ghostPid | Out-Null
        }
        Start-Sleep -Milliseconds 800
        if (@(Get-ListeningPids $preferred).Count -eq 0) {
            return $preferred
        }
        Write-Warn "Port $preferred still busy. Using port $fallback."
    } elseif (-not (Test-ApiHealthReady $preferred)) {
        Write-Warn "Port $preferred is busy but API does not respond. Restarting on $preferred..."
        Stop-Port $preferred "API"
        Start-Sleep -Milliseconds 800
        if (@(Get-ListeningPids $preferred).Count -eq 0) {
            return $preferred
        }
        Write-Warn "Could not free port $preferred. Using port $fallback."
    } else {
        Write-Warn "Port $preferred has a running API without required routes. Will restart."
        Stop-Port $preferred "API"
        Start-Sleep -Milliseconds 800
        return $preferred
    }
    return $fallback
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSec = 45) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 600
        }
    }
    return $false
}

function Clear-StaleDatabaseImportLock {
    try {
        $code = @"
from backend.services.database_import_tasks import clear_stale_import_lock, is_database_import_in_progress
import logging
log = logging.getLogger('start')
clear_stale_import_lock(log=log)
is_database_import_in_progress()
"@
        & $Python -c $code 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Checked database import lock (stale locks cleared if needed)."
        }
    } catch {
        Write-Warn "Could not check database import lock: $_"
    }
}

function Show-ApiLogTail([int]$Lines = 24) {
    $logPath = Join-Path $Root "backend\logs\api.log"
    if (-not (Test-Path -LiteralPath $logPath)) {
        Write-Warn "Log file not found: $logPath"
        return
    }
    Write-Host ""
    Write-Host "--- Last $Lines lines of backend/logs/api.log ---" -ForegroundColor DarkGray
    try {
        Get-Content -LiteralPath $logPath -Tail $Lines -ErrorAction Stop | ForEach-Object { Write-Host $_ }
    } catch {
        Write-Warn "Could not read api.log: $_"
    }
    Write-Host "--- end api.log ---" -ForegroundColor DarkGray
    Write-Host ""
}

function Wait-ApiReady([int]$Port, [int]$TimeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $lastLog = [datetime]::MinValue
    while ((Get-Date) -lt $deadline) {
        if (Test-PortServesCurrentApi $Port) {
            return $true
        }
        if (((Get-Date) - $lastLog).TotalSeconds -ge 12) {
            Write-Info "Still waiting for http://127.0.0.1:${Port}/api/health ..."
            $lastLog = Get-Date
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Write-ApiPortConfig([int]$Port) {
    Set-Content -Path (Join-Path $Root ".api-port") -Value "$Port" -Encoding utf8
    $envLocal = Join-Path $FrontendDir ".env.local"
    @(
        "# Generated by start.ps1"
        "VITE_API_PORT=$Port"
    ) -join "`r`n" | Set-Content -Path $envLocal -Encoding utf8
}

function Start-ApiServer([int]$Port, [string]$HostBind = "127.0.0.1") {
    $cmd = Get-UvicornDevCommandLine -PythonExe $Python -ProjectRoot $Root -Port $Port -BindHost $HostBind
    $apiTitle = "Health API port $Port"
    Start-ServiceWindow $apiTitle @(
        "Set-Location -LiteralPath '$($Root.Replace("'", "''"))'"
        $cmd
    )
    Write-Info "API process started (window: $apiTitle, logs: backend/logs/api.log)"
}

function Start-ServiceWindow([string]$Title, [string[]]$CommandLines) {
  $tmp = Join-Path $env:TEMP ("healthdash_" + [guid]::NewGuid().ToString("n") + ".ps1")
  $body = @(
    "`$Host.UI.RawUI.WindowTitle = '$($Title.Replace("'", "''"))'"
    $CommandLines
  ) -join "`r`n"
  Set-Content -Path $tmp -Value $body -Encoding UTF8
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $tmp
  ) -WorkingDirectory $Root -WindowStyle Normal | Out-Null
}

function Ensure-Npm() {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $npm) {
        throw "npm not found. Install Node.js from https://nodejs.org/"
    }
    return $npm.Source
}

function Get-LanIPv4Addresses() {
    $ips = @()
    try {
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -match '^\d{1,3}(\.\d{1,3}){3}$' -and
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown' -and
                $_.InterfaceAlias -notmatch 'Tailscale|WSL|vEthernet|Loopback|VirtualBox|VMware'
            } |
            ForEach-Object { $ips += $_.IPAddress }
    } catch {
        $ips = @()
    }
    return @($ips | Select-Object -Unique)
}

function Get-TailscaleIPv4() {
    $ts = Get-Command tailscale -ErrorAction SilentlyContinue
    if (-not $ts) { return $null }
    try {
        $out = & $ts.Source ip -4 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
        $ip = ($out | Select-Object -First 1).ToString().Trim()
        if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
    } catch {
        return $null
    }
    return $null
}

if ($Stop) {
    Stop-AllUvicornBackendMain
    Stop-ProjectUvicornWorkers
    Stop-Port $ApiPortPreferred "API"
    Stop-Port $ApiPortFallback "API"
    Stop-Port $FrontendPort "Frontend"
    Write-Info "Done."
    exit 0
}

function Ensure-DevBootstrap {
    $venvDir = Join-Path $Root "venv"
    if (-not (Test-Path $Python)) {
        Write-Info "First-time setup: creating Python venv..."
        $py = Get-Command py -ErrorAction SilentlyContinue
        if ($py) {
            & py -3.12 -m venv $venvDir 2>$null
            if ($LASTEXITCODE -ne 0) { & py -3 -m venv $venvDir }
        } else {
            $python = Get-Command python -ErrorAction SilentlyContinue
            if (-not $python) {
                Write-Host "Python not found. Install Python 3.11+ from https://www.python.org/" -ForegroundColor Red
                exit 1
            }
            & python -m venv $venvDir
        }
        if (-not (Test-Path $Python)) {
            Write-Host "Failed to create venv at $venvDir" -ForegroundColor Red
            Write-Host "Run manually: py -3.12 -m venv venv" -ForegroundColor Yellow
            Write-Host "Then: .\start.ps1 -Install" -ForegroundColor Yellow
            exit 1
        }
        $script:Install = $true
        Write-Info "venv created. Installing dependencies..."
    }
    $envExample = Join-Path $Root ".env.example"
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
        Copy-Item $envExample $envFile
        Write-Info "Created .env from .env.example (edit for OAuth if needed)."
    }
}

Ensure-DevBootstrap

if (-not (Test-Path $Python)) {
    Write-Host "venv not found: $Python" -ForegroundColor Red
    Write-Host "Run: py -3.12 -m venv venv" -ForegroundColor Yellow
    Write-Host "Then: .\start.ps1 -Install" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $Root "backend/main.py"))) {
    Write-Host "Run this script from project root: $Root" -ForegroundColor Red
    exit 1
}

function Install-PythonDeps {
    $pip = Join-Path $Root "venv/Scripts/pip.exe"
    $reqFiles = @(
        (Join-Path $Root "requirements.txt"),
        (Join-Path $Root "backend/requirements.txt")
    )
    foreach ($req in $reqFiles) {
        if (-not (Test-Path $req)) { continue }
        Write-Info "pip install -r $req ..."
        & $pip install -r $req
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "pip install failed for $req (exit $LASTEXITCODE); trying individual extras..."
            if ($req -like "*requirements.txt" -and $req -notlike "*backend*") {
                & $pip install authlib openpyxl gspread oauth2client fitdecode gpxpy "pytcx>=0.3.0"
            }
        }
    }
}

$npmCmd = Ensure-Npm

if ($Install) {
    Install-PythonDeps
}

& $Python -c "import backend.main" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Python deps missing (backend.main import failed)." -ForegroundColor Red
    Write-Host "Run: .\start.ps1 -Install" -ForegroundColor Yellow
    exit 1
}

if ($Install -or -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Info "npm install in frontend..."
    Push-Location $FrontendDir
    try {
        & $npmCmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

function Ensure-DatabaseSchema {
    Write-Info "Ensuring database schema (first run may take up to a minute)..."
    $schemaCli = Join-Path $Root "scripts/ensure_db_schema_cli.py"
    & $Python $schemaCli
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Database migration failed." -ForegroundColor Red
        Write-Host "Try: .\start.ps1 -Stop" -ForegroundColor Yellow
        Write-Host "Then delete workouts.db and shared.db in the project root and run start again." -ForegroundColor Yellow
        exit 1
    }
}

$SkipApiStart = $false
if ($Source) {
    Write-Info "Source mode: dev API from venv (not Forma backend.exe)..."
    Stop-FormaPackagedBackend
    Stop-AllUvicornBackendMain
    Stop-ProjectUvicornWorkers
    Stop-Port $ApiPortPreferred "API"
    Stop-Port $ApiPortFallback "API"
    Start-Sleep -Seconds 1
    $ApiPort = $ApiPortPreferred
    $SkipApiStart = $false
} else {
    $ApiPort = Resolve-ApiPort
}
$ApiHealthUrl = "http://127.0.0.1:$ApiPort/api/health"

if (-not $NoRestart) {
    if ((Get-ActiveListeningPids $ApiPort).Count -gt 0) {
        Write-Warn "Port $ApiPort busy - restarting API..."
        Stop-Port $ApiPort "API"
    }
    if ((Get-ActiveListeningPids $FrontendPort).Count -gt 0) {
        Write-Warn "Port $FrontendPort busy - restarting frontend..."
        Stop-Port $FrontendPort "Frontend"
    }
    Start-Sleep -Seconds 1
}

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

Clear-StaleDatabaseImportLock

if (-not $SkipApiStart) {
    Ensure-DatabaseSchema
}

if (-not (Test-Path $UvicornDevScript)) {
    Write-Host "Missing $UvicornDevScript" -ForegroundColor Red
    exit 1
}
. $UvicornDevScript

if (-not $SkipApiStart) {
    Write-Info "Starting FastAPI on port $ApiPort (uvicorn --reload)..."
    Write-Info (Get-UvicornDevDisplayCommand -ProjectRoot $Root -Port $ApiPort -BindHost $BindApiHost)
    Start-ApiServer $ApiPort $BindApiHost
} else {
    Write-Info "Skipping API start (current API already on port $ApiPort)."
}

if (-not $SkipApiPortConfig) {
    Write-ApiPortConfig $ApiPort
} else {
    Write-Info "Keeping existing .api-port / frontend/.env.local (SkipApiPortConfig)."
}

Write-Info "Waiting for API on port $ApiPort (up to 90s, first start may run DB migrations)..."
if (-not (Wait-ApiReady $ApiPort 90)) {
    Write-Host ""
    Write-Host "API did not become ready on port $ApiPort." -ForegroundColor Red
    Write-Host "  Check window 'Health API port $ApiPort' or backend/logs/api.log" -ForegroundColor Yellow
    Write-Host "  Do not open the dashboard until API responds:" -ForegroundColor Yellow
    Write-Host "  http://127.0.0.1:$ApiPort/api/health" -ForegroundColor Yellow
    Write-Host "  Tip: .\start.ps1 -Stop then restart; -Source stops packaged backend.exe" -ForegroundColor Yellow
    Show-ApiLogTail
    exit 1
}
Write-Info "API ready: http://127.0.0.1:$ApiPort/docs"
if ($ApiPort -ne $ApiPortPreferred) {
    Write-Warn "Dashboard uses API port $ApiPort (port $ApiPortPreferred is blocked by an old/zombie process)."
}

if (-not $NoRestart) {
    Stop-Port $FrontendPort "Frontend"
}

$viteAlreadyUp = $false
if ($DesktopLan -and (Wait-HttpReady $FrontendUrl 3)) {
    $viteAlreadyUp = $true
    Write-Info "Vite already running at $FrontendUrl - leaving dev frontend as-is."
}

if (-not $viteAlreadyUp) {
    if (-not (Wait-PortFree $FrontendPort 12)) {
        Write-Host ""
        Write-Host "Port $FrontendPort is still in use (old Vite / node.exe)." -ForegroundColor Red
        Write-Host '  1) Close the Health Frontend window (port 5173)' -ForegroundColor Yellow
        Write-Host '  2) Or run: .\start.ps1 -Stop' -ForegroundColor Yellow
        Write-Host '  3) Or end node.exe in Task Manager' -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }

    Write-Info "Starting Vite on port $FrontendPort (API proxy -> $ApiPort)..."
    $frontendTitle = "Health Frontend port $FrontendPort"
    $npmForScript = $npmCmd.Replace("'", "''")
    $npmDevLine = '& ' + [char]39 + $npmForScript + [char]39 + ' run dev -- --host'
    $viteEnvLine = '$env:VITE_API_PORT = ' + [string]$ApiPort
    Start-ServiceWindow $frontendTitle @(
      "Set-Location -LiteralPath '$($FrontendDir.Replace("'", "''"))'"
      $viteEnvLine
      $npmDevLine
    )

    Write-Info "Waiting for frontend..."
    if (Wait-HttpReady $FrontendUrl 30) {
        Write-Info "Frontend ready: $FrontendUrl"
    } else {
        Write-Warn "Frontend timeout - check window Health Frontend"
    }
}

$tailscaleIp = Get-TailscaleIPv4
$lanIps = @(Get-LanIPv4Addresses)

if ($OpenFirewall) {
    $fwScript = Join-Path $Root "scripts/open_lan_firewall.ps1"
    if (Test-Path $fwScript) {
        Write-Info "Opening Windows Firewall for ports $FrontendPort and $ApiPort (needs Admin)..."
        & powershell.exe -ExecutionPolicy Bypass -File $fwScript -FrontendPort $FrontendPort -ApiPort $ApiPort
    }
}

Write-Host ""
Write-Host "  Dashboard (this PC):    $FrontendUrl" -ForegroundColor Green
Write-Host "  API docs (this PC):     http://127.0.0.1:$ApiPort/docs" -ForegroundColor Green
if ($lanIps.Count -gt 0) {
    foreach ($ip in $lanIps) {
        Write-Host "  Dashboard (LAN/Wi-Fi):  http://${ip}:$FrontendPort" -ForegroundColor Green
        if ($BindApiHost -eq "0.0.0.0") {
            Write-Host "  Mobile API (LAN/Wi-Fi): http://${ip}:$ApiPort" -ForegroundColor Green
            Write-Host "  Mobile health check:    http://${ip}:$ApiPort/api/health" -ForegroundColor Green
        }
    }
    Write-Host "  On phone/tablet use LAN URL above (not 127.0.0.1)." -ForegroundColor DarkGray
    if ($BindApiHost -ne "0.0.0.0") {
        Write-Host "  For Android app: .\start.ps1 -MobileLan  (or -BindApiHost 0.0.0.0)" -ForegroundColor DarkGray
    }
} else {
    Write-Warn "LAN IP not detected. Run: ipconfig  and use IPv4 of Wi-Fi/Ethernet."
}
if ($tailscaleIp) {
    Write-Host "  Dashboard (Tailscale):  http://${tailscaleIp}:$FrontendPort" -ForegroundColor Green
    Write-Host "  API (Tailscale):        http://${tailscaleIp}:$ApiPort/docs" -ForegroundColor Green
    if ($BindApiHost -eq "0.0.0.0") {
        Write-Host "  Mobile API (Tailscale): http://${tailscaleIp}:$ApiPort" -ForegroundColor Green
    }
}
Write-Host ""
Write-Host "LAN blocked? Run as Admin: .\start.ps1 -OpenFirewall" -ForegroundColor DarkGray
Write-Host "       or: .\scripts\open_lan_firewall.ps1" -ForegroundColor DarkGray
Write-Host "Stop: .\start.ps1 -Stop" -ForegroundColor DarkGray

if (-not $NoBrowser) {
    Start-Sleep -Seconds 1
    Start-Process $FrontendUrl | Out-Null
}
