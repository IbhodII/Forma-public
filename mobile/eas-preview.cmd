@echo off
REM Сборка APK (CMD). Двойной клик или: eas-preview.cmd
cd /d "%~dp0"
set EAS_NO_VCS=1
call npm run eas:preview
pause
