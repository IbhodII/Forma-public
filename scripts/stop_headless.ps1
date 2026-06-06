# Остановка процессов на портах 8000 и 5173.

$Ports = @(8000, 5173)
$Log = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "logs\startup.log"

function Write-Log([string]$Text) {
    $dir = Split-Path $Log -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Add-Content -Path $Log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Text" -Encoding UTF8
}

foreach ($port in $Ports) {
    netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING" | ForEach-Object {
        $parts = ($_.Line -replace "\s+", " ").Trim().Split(" ")
        if ($parts.Length -ge 5) {
            $procId = [int]$parts[-1]
            if ($procId -gt 0) {
                try {
                    Stop-Process -Id $procId -Force -ErrorAction Stop
                    Write-Log "Stopped PID $procId on port $port"
                } catch {
                    Write-Log "Failed to stop PID $procId on port $port"
                }
            }
        }
    }
}
