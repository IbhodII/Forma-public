# Создаёт задачу Планировщика: запуск при входе в Windows (без окон).
# Запуск от администратора не обязателен (задача в профиле текущего пользователя).
#
#   powershell -ExecutionPolicy Bypass -File scripts\register_scheduled_task.ps1
# Удалить задачу:  Unregister-ScheduledTask -TaskName "HealthDashboard" -Confirm:$false

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Vbs = Join-Path $Root "start_headless.vbs"
$TaskName = "HealthDashboard"

if (-not (Test-Path $Vbs)) {
    throw "Not found: $Vbs"
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$Vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Health Dashboard API + React (headless)" -Force | Out-Null

Write-Host "Task registered: $TaskName"
Write-Host "  Run: wscript.exe `"$Vbs`""
Write-Host "  Logs: $Root\logs\"
