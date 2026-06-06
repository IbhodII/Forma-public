@echo off
cd /d C:\Users\brett\Desktop\MyHealthDashboard

:: Запускаем бэкенд скрыто через pythonw.exe
start /B "" .\venv\Scripts\pythonw.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

:: Ждём 2 секунды
timeout /t 2 /nobreak >nul

:: Запускаем React-фронтенд (через cmd, но без окна – используем VBS)
echo Set oShell = CreateObject("WScript.Shell") > %temp%\run_vite.vbs
echo oShell.Run "cmd /c cd /d C:\Users\brett\Desktop\MyHealthDashboard\frontend && npm run dev", 0, False >> %temp%\run_vite.vbs
cscript //nologo %temp%\run_vite.vbs
del %temp%\run_vite.vbs

:: Ждём 5 секунд и открываем браузер
timeout /t 5 /nobreak >nul
start http://localhost:5173

exit