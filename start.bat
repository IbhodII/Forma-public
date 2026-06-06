@echo off
REM API + React (0.0.0.0 — доступ с Tailscale). If this opens Notepad, use start.vbs instead.
REM API dev: uvicorn --reload --reload-dir backend --reload-dir database --reload-dir utils --reload-dir .
REM (см. scripts\UvicornDev.ps1, вызывается из start.ps1)
cd /d "%~dp0"
set "PS1=%~dp0start.ps1"
set "PWSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PWSH%" set "PWSH=powershell.exe"
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo.
  echo Launch failed. Try start.vbs or run in terminal:
  echo   powershell -ExecutionPolicy Bypass -File start.ps1
  echo.
  pause
)
exit /b %ERR%
