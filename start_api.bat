@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
set "PYTHON=%ROOT%venv\Scripts\python.exe"
set PORT=8000
set URL=http://127.0.0.1:%PORT%

if not exist "%ROOT%backend\main.py" (
  echo.
  echo [ОШИБКА] Не найден backend\main.py
  echo Запускайте start_api.bat из корня проекта:
  echo   %ROOT%
  echo.
  pause
  exit /b 1
)

if not exist "%PYTHON%" (
  echo.
  echo [ОШИБКА] Не найден Python в виртуальном окружении:
  echo   %PYTHON%
  echo.
  echo Создайте venv из корня проекта:
  echo   py -3.12 -m venv venv
  echo   venv\Scripts\pip install -r backend\requirements.txt
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%backend\logs" mkdir "%ROOT%backend\logs"

"%PYTHON%" -c "import uvicorn" 2>nul
if errorlevel 1 (
  echo.
  echo [ОШИБКА] В venv не установлен uvicorn.
  echo   venv\Scripts\pip install -r backend\requirements.txt
  echo.
  pause
  exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo.
  echo API уже запущен на %URL% ^(PID %%a^).
  echo Остановить: taskkill /PID %%a /F
  echo Или: powershell -File start.ps1 -Stop
  echo.
  pause
  exit /b 0
)

echo Starting FastAPI on %URL%
echo Logs: backend\logs\api.log
echo.

"%PYTHON%" -m uvicorn backend.main:app --reload --reload-dir backend --reload-dir database --reload-dir utils --reload-dir . --reload-exclude venv --reload-exclude frontend --reload-exclude node_modules --reload-exclude docs --reload-exclude dist --reload-exclude *.db --host 127.0.0.1 --port %PORT%
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo.
  echo [ОШИБКА] uvicorn завершился с кодом %ERR%
  echo Смотрите backend\logs\api.log
)
pause
exit /b %ERR%
