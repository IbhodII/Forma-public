# Forma — Android (React Native)

**Стек:** React Native 0.76 (bare) + Health Connect + FastAPI (тот же backend, что десктоп).

> Не Expo Go: папка `android/` в репозитории. Expo (`app.config.js`, `eas.json`) — для метаданных и EAS.

**Полная документация:** [docs/MOBILE.md](../docs/MOBILE.md)

---

## Быстрый старт

### 1. Настройте `mobile/.env`

```powershell
copy .env.example .env
# Задайте оба адреса (приложение выберет доступный):
# EXPO_PUBLIC_API_BASE_URL_LOCAL=http://192.168.x.x:8002
# EXPO_PUBLIC_API_BASE_URL_TAILSCALE=http://100.x.x.x:8002
```

### 2. Запустите API на ПК

```powershell
cd ..
.\start.ps1
```

### 3. Соберите APK

```powershell
npm install
npm run android:release
```

Установите: `android/app/build/outputs/apk/release/app-release.apk`

---

## Вход

**Рекомендуется:** admin по Wi‑Fi (как «Войти локально (админ)» на ПК).  
Опционально: **Яндекс** / **Google**.

URL API: два адреса (Wi‑Fi + Tailscale) в `.env` или на экране входа / Настройки → Подключение к ПК.

---

## Сборка

| Способ | Команда |
|--------|---------|
| **Локально** | `npm run android:release` |
| **EAS** | `npm run eas:preview` — см. [BUILD_EAS.md](./BUILD_EAS.md) |
| **Debug** | `npm start` + `npm run android` |

Оба способа (локально и EAS) дают одинаковый тип APK; EAS не обязателен.

---

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `EXPO_PUBLIC_API_BASE_URL_LOCAL` | LAN / Wi‑Fi (порт 8000/8002) |
| `EXPO_PUBLIC_API_BASE_URL_TAILSCALE` | Tailscale `100.x.x.x` |
| `EXPO_PUBLIC_API_BASE_URL` | Один URL, если не заданы LOCAL/TAILSCALE |
| `EXPO_PUBLIC_API_BASE` | Legacy alias для `EXPO_PUBLIC_API_BASE_URL` |
| `EXPO_PUBLIC_YANDEX_CLIENT_ID` | OAuth Яндекс (облачные бэкапы + вход) |
| `EXPO_PUBLIC_YANDEX_REDIRECT_URI` | Redirect URI Яндекс OAuth (по умолчанию `myhealthdashboard://oauth/yandex`) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | OAuth Google |

Примеры URL — в [.env.example](./.env.example).

---

## Health Connect

Разрешения в `android/app/src/main/AndroidManifest.xml`.  
Синхронизация: **Настройки → Health Connect** → `POST /api/sync/health-connect`.  
Диагностика на ПК: **Настройки → Синхронизация → Health Connect Debug** — [docs/HEALTH_CONNECT.md](../docs/HEALTH_CONNECT.md).

---

## Документы

| Файл | Тема |
|------|------|
| [docs/MOBILE.md](../docs/MOBILE.md) | Вход, API URL, LAN/Tailscale, troubleshooting |
| [BUILD_EAS.md](./BUILD_EAS.md) | EAS, JDK, gradle |
| [CLOUD_SYNC_ANDROID.md](./CLOUD_SYNC_ANDROID.md) | Бэкапы на Яндекс.Диск / Google Drive |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | UI-токены |
