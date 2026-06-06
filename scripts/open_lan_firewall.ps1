# -*- coding: utf-8 -*-
# Открыть входящие порты для доступа с телефона/планшета в локальной сети.
# Запуск от имени администратора:
#   powershell -ExecutionPolicy Bypass -File .\scripts\open_lan_firewall.ps1

param(
    [int]$FrontendPort = 5173,
    [int]$ApiPort = 8000,
    [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Запустите PowerShell от имени администратора." -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\open_lan_firewall.ps1" -ForegroundColor Yellow
    exit 1
}

$ports = if ($ApiOnly) {
    @($ApiPort)
} else {
    @($FrontendPort, $ApiPort) | Where-Object { $_ -gt 0 }
} | Sort-Object -Unique

foreach ($port in $ports) {
    $ruleName = "Health Dashboard LAN TCP $port"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Правило уже есть: $ruleName" -ForegroundColor DarkGray
        continue
    }
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $port `
        -Profile Private, Domain | Out-Null
    Write-Host "Добавлено: $ruleName (TCP $port, профили Private/Domain)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Готово. С другого устройства откройте http://<IP_этого_ПК>:$FrontendPort" -ForegroundColor Cyan
Write-Host "(IP смотрите в выводе start.ps1 — строка Dashboard LAN)" -ForegroundColor DarkGray
