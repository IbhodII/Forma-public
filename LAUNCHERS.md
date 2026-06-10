# Скрипты запуска Health Dashboard

Рекомендуемый способ: **`start.ps1`** или двойной клик **`start.vbs`**.

Проверка backend:

```powershell
cd C:\path\to\MyHealthDashboard
.\venv\Scripts\python.exe -c "import backend.main; print('OK')"
```

---

## Рекомендуемые скрипты

| Файл | Назначение |
|------|------------|
| **`start.bat`** / **`start.ps1`** | API `:8000` + Vite `:5173`, браузер, освобождение портов |
| `start_headless.vbs` | Автозапуск без окон (Планировщик заданий) |
| `scripts\start_headless.ps1` | Логика headless; логи в `logs\` |
| `scripts\stop_headless.ps1` | Остановка портов 8000, 5173 |
| `scripts\register_scheduled_task.ps1` | Задача «при входе в систему» |
| `start_sync.bat` | Фоновый FIT (`background_sync.py`) |

### Планировщик Windows

1. `venv` + `frontend\node_modules` установлены.
2. Один раз: `powershell -ExecutionPolicy Bypass -File scripts\register_scheduled_task.ps1`
3. Или вручную: триггер «При входе» → `wscript.exe` + путь к `start_headless.vbs`
4. Логи: `logs\startup.log`, `logs\api.err.log`, `logs\frontend.err.log`
5. UI: http://localhost:5173

### `start.ps1` параметры

| Параметр | Описание |
|----------|----------|
| (default) | API + Vite + браузер |
| `-Install` | `npm install` при необходимости |
| `-NoBrowser` | Без открытия браузера |
| `-Stop` | Остановить процессы на портах |
| `-NoRestart` | Не перезапускать занятые порты |

---

## URL

| Сервис | URL |
|--------|-----|
| React UI | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000 (или **8002** — см. `.api-port` в корне) |
| Swagger | http://127.0.0.1:8000/docs |

`start.ps1` освобождает занятый 8000; если порт занят «зомби» или API устарел (нет маршрутов nutrition/deficit-control), переключается на **8002**. Обновляются `.api-port`, `frontend/.env.local` (`VITE_API_PORT`). После смены порта — `.\start.ps1 -Stop`, затем снова старт.

Проверка актуальности API: в Swagger должны быть `GET /api/nutrition/cut/deficit-control` и `POST /api/nutrition/forecast/dynamic`.

**Мобильный APK:** `EXPO_PUBLIC_API_BASE_URL` = `http://LAN_IP:ПОРТ` или Tailscale — см. [docs/MOBILE.md](docs/MOBILE.md).

---

## Устаревшие bat-файлы

`start_all.bat`, `start_manual.bat`, `start_react_only.bat`, `start_api.bat` — дубли с жёсткими путями; используйте `start.ps1` / `start_headless.vbs`.

Оставить при необходимости: `start_sync.bat` — отдельная FIT-синхронизация.

Подробнее: [README.md](README.md), установка — [docs/archive/SETUP.md](docs/archive/SETUP.md).
