@echo off
title Health Dashboard Launcher
echo Starting Backend...
start "Backend" cmd /k "cd /d C:\Users\brett\Desktop\MyHealthDashboard && .\venv\Scripts\activate && .\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
echo Starting Frontend...
start "Frontend" cmd /k "cd /d C:\Users\brett\Desktop\MyHealthDashboard\frontend && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173
echo Dashboard started. Close this window if you want.