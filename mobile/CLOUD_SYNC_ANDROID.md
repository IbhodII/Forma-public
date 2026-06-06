# Облачная синхронизация (Android)

Нативный бэкап SQLite (`myhealth.db`) в **Яндекс.Диск** и **Google Drive** с OAuth на устройстве. Токены хранятся в **react-native-keychain** (отдельно от Polar).

## Зависимости

Установлены: `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `react-native-keychain`, `react-native-url-polyfill`, `react-native-fs` (уже был).

Пакеты `@react-native-omh/storage-yandex-disk` **не существуют** в OMH Storage (только Google Drive / OneDrive / Dropbox). Яндекс реализован через REST API Диска.

## Переменные окружения

Создайте `mobile/.env` по образцу `.env.example`:

| Переменная | Описание |
|------------|----------|
| `EXPO_PUBLIC_YANDEX_CLIENT_ID` | ID приложения Яндекс OAuth |
| `EXPO_PUBLIC_YANDEX_REDIRECT_URI` | Redirect URI (должен совпадать с OAuth кабинетом) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Web Client ID Google Cloud |
| `EXPO_PUBLIC_GOOGLE_ANDROID_REDIRECT_SCHEME` | Опционально: `com.googleusercontent.apps.…` |

После изменения `.env` пересоберите приложение (`npx react-native run-android`).

## Redirect URI

В настройках → «Синхронизация и облако» отображаются фактические redirect URI. Для Яндекса используется **строго**:

- Яндекс: `myhealthdashboard://oauth/yandex`
- Google: `myhealthdashboard://oauth/google` или `com.googleusercontent.apps.XXX:/oauth2redirect`

Зарегистрируйте их в консолях OAuth.

### Android deep link (intent filter)

Redirect `myhealthdashboard://oauth/yandex` парсится Android как `host=oauth`, `path=/yandex`.
Intent-filter:

```xml
<data android:scheme="myhealthdashboard" android:host="oauth" android:pathPrefix="/yandex" />
```

Неверный `android:host="oauth.yandex"` не ловит callback → OAuth выглядит как «cancelled».

### Implicit flow (Яндекс)

Нативный Android OAuth без client_secret использует `response_type=token`.
Токен приходит во fragment: `#access_token=...&expires_in=...`

Для диагностики: `EXPO_PUBLIC_OAUTH_DEBUG=1` в `mobile/.env` перед сборкой.

### Яндекс.Диск

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → создать приложение.
2. Права: Доступ к папке приложения на Диске.
3. Redirect URI = как в приложении.
4. Client ID → `EXPO_PUBLIC_YANDEX_CLIENT_ID`.

### Google Drive

1. Google Cloud Console → APIs → включить **Google Drive API**.
2. OAuth consent screen.
3. Credentials → OAuth client ID (Web) + при необходимости Android (SHA-1 отпечаток keystore).
4. Redirect URI = `myhealthdashboard://oauth/google` (или reversed scheme).
5. Client ID → `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

SHA-1 для debug:

```bash
cd mobile/android && ./gradlew signingReport
```

## Сборка

```bash
cd mobile
npm install
npx react-native run-android
```

## Тестирование

1. **Polar** — «Подключить Polar» → браузер → серверный callback. Убедитесь, что статус Polar не связан с облаком.
2. **Яндекс** — задайте Client ID → «Подключить» → войти → «Бэкап БД» → в Диске папка приложения `FormaBackups/backup_….db`.
3. **Восстановление** — измените локальные данные → «Восстановить последний бэкап» → перезапуск при необходимости.
4. **Google** — то же для Google Drive (папка `FormaBackups`).

## Polar не затронут

- Polar: `getPolarAuthUrl()` → `/api/polar/*` на бэкенде.
- Облако: Keychain `forma_cloud_yandex` / `forma_cloud_google`.

## Возможные проблемы

| Проблема | Решение |
|----------|---------|
| «Не задан CLIENT_ID» | `.env` + пересборка |
| OAuth не возвращается в приложение | intent-filter: `host=oauth`, `pathPrefix=/yandex`; redirect `myhealthdashboard://oauth/yandex`; см. CLOUD_SYNC_ANDROID.md |
| SQLite duplicate column on upgrade | Исправлено: PRAGMA table_info перед ADD COLUMN (`ensureColumn`) |
| Google `invalid_client` | SHA-1 в Android OAuth client, верный Web Client ID |
| База не найдена | Путь `…/databases/myhealth.db`; сначала откройте приложение и создайте БД |
| Восстановление не видно в UI | Полный перезапуск приложения после restore |
| Большой файл Google | Multipart base64 — для очень больших БД может быть медленно |

## Изменённые файлы

См. отчёт в чате / git diff.
