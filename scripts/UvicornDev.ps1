# Общие аргументы uvicorn для локальной разработки (auto-reload).
# Запускать из корня проекта (Set-Location $ProjectRoot).
# Uvicorn по умолчанию часто следит только за пакетом backend — не за database/, utils/, fit_importer.py.

function Get-UvicornDevArgumentList {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [int]$Port = 8000,
        [string]$BindHost = "0.0.0.0"
    )
    $null = Resolve-Path -LiteralPath $ProjectRoot

    # Относительные пути: cwd должен быть корень проекта (см. start.ps1 / start_api.bat).
    # Не добавлять "." — на Windows reloader часто падает или не поднимает порт.
    $reloadDirs = @(
        "backend",
        "database",
        "utils"
    )

    $args = @(
        "-m", "uvicorn", "backend.main:app",
        "--reload",
        "--host", $BindHost,
        "--port", "$Port"
    )
    foreach ($dir in $reloadDirs) {
        $args += "--reload-dir"
        $args += $dir
    }

    foreach ($pattern in @(
        "venv", "frontend", "node_modules", "docs", "dist",
        "backend/logs", "backend\\logs", "*.log"
    )) {
        $args += "--reload-exclude"
        $args += $pattern
    }

    return $args
}

function Get-UvicornDevCommandLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PythonExe,
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [int]$Port = 8000,
        [string]$BindHost = "0.0.0.0"
    )
    $argList = Get-UvicornDevArgumentList -ProjectRoot $ProjectRoot -Port $Port -BindHost $BindHost
    $parts = @("& '$($PythonExe.Replace("'", "''"))'")
    foreach ($a in $argList) {
        if ($a -match '[\s'']') {
            $parts += "'$($a.Replace("'", "''"))'"
        } else {
            $parts += $a
        }
    }
    return ($parts -join ' ')
}

function Get-UvicornDevDisplayCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [int]$Port = 8000,
        [string]$BindHost = "0.0.0.0"
    )
    $argList = Get-UvicornDevArgumentList -ProjectRoot $ProjectRoot -Port $Port -BindHost $BindHost
    return "python " + ($argList -join " ")
}
