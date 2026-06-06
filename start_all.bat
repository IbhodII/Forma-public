@echo off
REM Устарело: используйте start.bat (то же самое, но надёжнее).
cd /d "%~dp0"
echo Запуск через start.bat / start.ps1 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
exit /b %ERRORLEVEL%
