$errors = $null
$tokens = $null
$path = Join-Path (Split-Path $PSScriptRoot -Parent) "start.ps1"
[void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count -eq 0) { Write-Host "OK" } else { $errors | ForEach-Object { Write-Host $_.Extent.Text; Write-Host $_.Message } }
