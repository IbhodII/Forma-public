# Сборка APK через EAS Build

Проект: **bare React Native** + `app.config.js` + `eas.json`. Папка `android/` уже в репозитории.

## 1. Подготовка (один раз)

```powershell
cd C:\Users\brett\Desktop\MyHealthDashboard\mobile
npm install
```

Войти в Expo (интерактивно, в терминале):

```powershell
npx eas login
```

Привязать проект к аккаунту Expo (создаст/обновит `projectId` в конфиге):

```powershell
npm run eas:configure
# или: npx eas build:configure -p android
```

Если `projectId` не появился:

```powershell
npx eas init
```

Проверка:

```powershell
npx eas whoami
npx eas project:info
```

## 2. Конфигурация (уже в репозитории)

| Поле | Значение |
|------|----------|
| `android.package` | `com.myhealthdashboard.app` |
| `name` | MyHealth Dashboard |
| `slug` | `myhealthdashboard` |
| `version` | `1.0.0` |

Файлы: `app.config.js`, `app.json` (секция `expo`), `eas.json`.

Профиль **preview** → **APK** (`buildType: "apk"`).

## 3. `projectId` (уже привязан)

Проект: [@ibhodi/myhealthdashboard](https://expo.dev/accounts/ibhodi/projects/myhealthdashboard)  
ID в `app.config.js`: `2f498565-e742-4ae6-8b86-10caabae0960`

Если `eas build:configure` не смог записать ID в `app.config.js` — значение уже прописано вручную.

## 4. Git / EAS_NO_VCS

Если `git command not found` — скрипты `npm run eas:*` уже задают `EAS_NO_VCS=1` через `cross-env`.

**CMD (ваш случай):** не используйте `$env:...` — это PowerShell. Просто:

```cmd
cd C:\Users\brett\Desktop\MyHealthDashboard\mobile
npm install
npm run eas:preview
```

Или двойной клик: `eas-preview.cmd`

**PowerShell (если переключитесь):**

```powershell
$env:EAS_NO_VCS = "1"
npm run eas:preview
```

## 5. Переменные окружения (обязательно для телефона)

Задайте в `mobile/.env` **до** `eas build` / `npm run android:release` (или в [EAS Secrets](https://docs.expo.dev/build-reference/variables/) для облака):

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.31.54:8002
EXPO_PUBLIC_YANDEX_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
```

- **Wi‑Fi:** LAN-IP из `start.ps1`, не `127.0.0.1`.
- **Tailscale:** `100.x.x.x` + Tailscale на телефоне.

Подробно: [docs/MOBILE.md](../docs/MOBILE.md).

## 6. Запуск сборки APK

```cmd
npm run eas:preview
```

При первой сборке выберите **Generate new keystore** (Expo хранит credentials).

Или с ожиданием и ссылкой на артефакт:

```powershell
npx eas build --platform android --profile preview
```

После завершения:

```powershell
npx eas build:list --platform android --limit 1
npx eas build:download --platform android --latest
```

## 4. CI / без интерактива

1. Создайте [access token](https://expo.dev/accounts/[account]/settings/access-tokens).
2. `$env:EXPO_TOKEN = "ваш_токен"`
3. `npm run eas:preview`

## 5. Локальная сборка (без EAS)

Нужны **JDK 17**, **Android SDK** (после установки Android Studio) и **Node/npm** в `mobile/`.

### JDK (ошибка «Cannot find Java 17» / foojay Read timed out)

В `android/gradle.properties` уже задано:

```properties
org.gradle.java.home=C:/Program Files/Microsoft/jdk-17.0.19.10-hotspot
org.gradle.java.installations.auto-download=false
```

**Android Studio:** *File → Settings → Build, Execution, Deployment → Build Tools → Gradle* → **Gradle JDK** → выберите **Microsoft OpenJDK 17** (не «Embedded» JBR, если Gradle ругается).

В PowerShell перед сборкой (опционально):

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
```

Затем **Sync Project with Gradle Files** (иконка слона) или перезапустите Studio.

### Сборка APK

```powershell
cd C:\Users\brett\Desktop\MyHealthDashboard\mobile
npm install
cd android
.\gradlew.bat clean assembleRelease -PreactNativeArchitectures=arm64-v8a
```

APK: `android\app\build\outputs\apk\release\app-release.apk`

Только **arm64** — достаточно для реальных телефонов; быстрее и меньше сбоев на Windows.

### Reanimated / ninja: `mkdir ... No such file or directory`

Длинный путь проекта (`Desktop\MyHealthDashboard\...`) + старый **ninja 1.10** в SDK. Варианты:

1. Заменить `Android\Sdk\cmake\*\bin\ninja.exe` на [ninja 1.12.1](https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip) (проверка: `ninja --version`).
2. Включить длинные пути Windows: *gpedit* → *Enable Win32 long paths*, или реестр `LongPathsEnabled=1`, перезагрузка.
3. Собрать из короткого пути: `subst H: C:\Users\brett\Desktop\MyHealthDashboard` → открыть `H:\mobile\android` в Studio.
4. Облачная сборка без возни: `npm run eas:preview`.

## Сборка JS-бандла (если EAS падает на Bundle JavaScript)

Локальная проверка (должна завершиться без ошибки):

```cmd
npm run bundle:check
```

Типичная причина: `metro.config.js` не использует `expo/metro-config`. В проекте уже исправлено + `babel-preset-expo`, `expo-asset`.

## Устранение проблем

| Ошибка | Действие |
|--------|----------|
| `An Expo user account is required` | `npx eas login` |
| `Invalid projectId` | `npx eas init` в `mobile/` |
| `JAVA_HOME is not set` / **Java 17 toolchain** | `org.gradle.java.home` в `gradle.properties`, Gradle JDK = 17 в Android Studio |
| **ninja mkdir … reanimated** (Windows) | Ninja ≥1.12.1 в SDK, длинные пути, `arm64-v8a`, или `subst` / EAS |
| Health Connect на устройстве | См. `README.md` — разрешения в манифесте |
| **Gradle / Run gradlew failed** | После `npm install` выполняется `postinstall` (Kotlin mlkit). В `android/gradle.properties`: `newArchEnabled=false`. Пересборка: `npm run eas:preview` |
| **Android native dependency not compatible** | Закреплены версии ML Kit в `android/build.gradle`; при сбое — откройте лог фазы **Run gradlew** на expo.dev и найдите строку `FAILURE:` / `error:` |
| **`EventEmitter` of undefined** при старте | Не был подключён Expo Modules в Android (`useExpoModules` в `settings.gradle`, `ReactNativeHostWrapper` в `MainApplication`). Пересоберите APK после `git pull` |

Перед EAS:

```cmd
cd mobile
npm install
npm run bundle:check
```
