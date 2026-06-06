# Запуск API + React без окон (для Планировщика заданий Windows).
# Логи: logs\api.log, logs\frontend.log
#
# Вручную (скрыто):  wscript.exe "%~dp0..\start_headless.vbs"
# Остановка:         powershell -File scripts\stop_headless.ps1

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Logs = Join-Path $Root "logs"
$Python = Join-Path $Root "venv\Scripts\python.exe"
$Npm = Join-Path $Root "frontend\node_modules\.bin\vite.cmd"
$FrontendDir = Join-Path $Root "frontend"
$ApiPort = 8000
$FrontendPort = 5173

New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Get-ListeningPids([int]$Port) {
    $pids = @()
    netstat -ano 2>$null | Select-String ":$Port\s" | Select-String "LISTENING" | ForEach-Object {
        $parts = ($_.Line -replace "\s+", " ").Trim().Split(" ")
        if ($parts.Length -ge 5) {
            $id = [int]$parts[-1]
            if ($id -gt 0) { $pids += $id }
        }
    }
    return $pids | Select-Object -Unique
}

function Write-Log([string]$Name, [string]$Text) {
    $path = Join-Path $Logs $Name
    Add-Content -Path $path -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Text" -Encoding UTF8
}

if (-not (Test-Path $Python)) {
    Write-Log "startup.log" "ERROR: venv not found at $Python"
    exit 1
}

if (-not (Test-Path $Npm)) {
    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Log "startup.log" "ERROR: run npm install in frontend"
        exit 1
    }
    $Npm = "npm.cmd"
}

# API
if ((Get-ListeningPids $ApiPort).Count -eq 0) {
    $apiOut = Join-Path $Logs "api.out.log"
    $apiErr = Join-Path $Logs "api.err.log"
    Write-Log "startup.log" "Starting API on port $ApiPort"
    Start-Process -FilePath $Python `
        -ArgumentList @("-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "$ApiPort") `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $apiOut `
        -RedirectStandardError $apiErr | Out-Null
} else {
    Write-Log "startup.log" "API already listening on $ApiPort"
}

Start-Sleep -Seconds 2

# Vite / React
if ((Get-ListeningPids $FrontendPort).Count -eq 0) {
    $feOut = Join-Path $Logs "frontend.out.log"
    $feErr = Join-Path $Logs "frontend.err.log"
    Write-Log "startup.log" "Starting frontend on port $FrontendPort"
    if ($Npm -like "*vite.cmd") {
        Start-Process -FilePath $Npm `
            -ArgumentList @("dev", "--host", "127.0.0.1", "--port", "$FrontendPort") `
            -WorkingDirectory $FrontendDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $feOut `
            -RedirectStandardError $feErr | Out-Null
    } else {
        Start-Process -FilePath "cmd.exe" `
            -ArgumentList @("/c", "npm run dev") `
            -WorkingDirectory $FrontendDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $feOut `
            -RedirectStandardError $feErr | Out-Null
    }
} else {
    Write-Log "startup.log" "Frontend already listening on $FrontendPort"
}

Write-Log "startup.log" "Done"
