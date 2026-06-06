# Health Dashboard — React frontend

Клиент для [FastAPI](../backend/main.py). Dev: `http://127.0.0.1:5173`, API через Vite proxy `/api` → `:8000`.

## Стек

- Vite 6 + React 18 + TypeScript
- React Router 6, Axios, TanStack Query
- Plotly.js, Leaflet / react-leaflet, Recharts
- Tailwind CSS 3

## Запуск

```powershell
# Из корня — рекомендуется
.\start.ps1

# Или вручную:
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
cd frontend
npm install
npm run dev
```

`.env` / `.env.local`:

```env
VITE_API_URL=/api
# VITE_API_PORT=8000  # задаёт start.ps1 в .env.local
```

## Сборка

```powershell
cd frontend
npm run build
npm run preview
```

## Desktop (Electron wrapper)

Существующий React/Vite UI запускается как desktop-приложение без браузерного UI.

### Структура

- `electron/main.cjs` — main process (окно, загрузка dev/prod)
- `electron/preload.cjs` — безопасный preload-слой
- `dist/` — production bundle Vite (используется Electron в release)

### Локальная разработка

```powershell
cd frontend
npm install
npm run desktop:build:web
npm run desktop:dev
```

Что происходит:

- Electron запускает backend-процесс (`uvicorn`) на свободном localhost-порту
- backend отдаёт API и `frontend/dist` с одного порта
- Electron открывает `http://127.0.0.1:{port}` после `GET /api/health`

### Production сборка Windows

```powershell
cd frontend
npm run desktop:dist
```

Результат:

- установщик и собранное приложение в `frontend/release/`
- приложение запускается как обычный desktop app (без терминала/консоли)
- внутри `resources` лежит `backend.exe`, который стартует/останавливается вместе с окном

### Быстрые команды из корня проекта

```powershell
# из корня репозитория
npm run desktop:dev
npm run desktop:dist
```

### Иконка приложения

Используется `build/icon.ico` (включается в окно и установщик через `electron-builder`).
Для замены иконки см. `build/ICON_GUIDE.md`.

## Страницы (`src/pages/`)

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/workouts` | `WorkoutsPage` | Силовые, кардио, пресеты, Polar queue |
| `/stretching` | `StretchPage` | Растяжка |
| `/stretching/session/:presetId` | `StretchingSession` | Таймер |
| `/body` | `BodyPage` | Замеры, вес, шаги |
| `/cut-bulk` | Cut/bulk plan | Сушка/набор |
| `/food` | `FoodDiaryPage` | Дневник питания |
| `/food/micros` | `MicrosTab` | Микронутриенты (неделя) |
| `/analytics` | `Analytics` | CTL, TRIMP, 1ПМ |
| `/cycle` | Menstrual cycle | Только `sex=female` |
| `/settings` | `SettingsPage` | 6 вкладок |
| `/my-bike` | `BikeSettingsPage` | Параметры велосипеда |

## Ключевые компоненты

| Комponent | Назначение |
|-----------|------------|
| `CardioSection` / `CardioWorkoutPanel` | Таблица кардио, карта, графики |
| `StrengthPage` | Силовые сессии, форма, Polar attach |
| `PolarPendingModal`, `PolarFileUploadModal` | Очередь и загрузка файлов |
| `FitImportButton`, `SyncButton` | FIT / интеграции |
| `useUnits` | metric / american отображение |

## API-клиенты (`src/api/`)

`strength.ts`, `cardio.ts`, `polar.ts`, `sync.ts`, `presets.ts`, `food.ts`, `user.ts`, `body.ts`, `analytics.ts`, `stretching.ts`, `menstrualCycle.ts`, `steps.ts`.

## Утилиты

- `utils/format.ts` — `formatDuration`, `chestStrapKcal`, pace/speed
- `utils/polarAutoAttach.ts` — auto attach Polar после save / load
- `hooks/usePolarAutoAttach.ts` — React hook для `/workouts`

## E2E

Из **корня** репозитория: `npm run test:e2e` (Playwright). См. [README.md](../README.md), [docs/archive/SETUP.md](../docs/archive/SETUP.md).

## Документация

[docs/README.md](../docs/README.md) — полное оглавление.
