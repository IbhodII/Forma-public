# Автономное приложение на Android

> **Статус (2026):** **частично реализовано.** Режимы `autonomous` и `cloud`, FormaSync v1, локальный HC pipeline и release hardening v1 — в коде. Ниже сохранён **исходный план**; актуальный чеклист — § «Статус реализации».

Связанные материалы: [MOBILE.md](./MOBILE.md), [FORMA_SYNC.md](./FORMA_SYNC.md), [../mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md), [../mobile/CLOUD_SYNC_ANDROID.md](../mobile/CLOUD_SYNC_ANDROID.md).

---

## Статус реализации (2026)

| Компонент | Статус | Где в коде |
|-----------|--------|------------|
| Вход Яндекс без ПК | **done** | `LoginScreen`, `loginAutonomousYandex`, `operatingMode.ts` |
| Локальная `myhealth.db` | **done** | `mobile/src/database/` |
| FormaSync engine (upload/download/apply) | **done** | `mobile/src/sync/FormaSyncEngine.ts`, `packageApplier.ts` |
| Очередь + banner sync | **done** | `syncOrchestrator.ts`, `OfflineContext.tsx` |
| Фон FormaSync ~4 h | **done** | `formaSyncBackgroundTask.ts` (240 min) |
| HC local + background 60 min | **done** | `healthConnectSync.ts`, `hcBackgroundTask.ts` |
| Desktop FormaSync participant | **done** | `backend/routers/forma_sync.py` — см. [FORMA_SYNC.md](./FORMA_SYNC.md) |
| Полный conflict merge | **in progress** | pilot `food_entries` — `conflictResolution.ts` |
| Push / poll уведомления | **not done** | — |
| Raw `hc_records` в пакете | **not done** | только `hc_days` rollup |
| Обязательный публичный VPS | **not done** | legacy API опционален |

---


## 1. Цели и границы

### Цели (MVP продукта)

- Приложение **работает без ПК и без `EXPO_PUBLIC_API_BASE_URL`** после установки APK.
- **Вход только через Яндекс** (нативно на устройстве); идентичность = стабильный `yandex_uid`.
- Все пользовательские действия **сначала пишут в локальную SQLite** (`myhealth.db`).
- **Синхронизация по желанию**: выгрузка/загрузка пакета на Яндекс.Диск; ПК видит «есть обновления» через `manifest.json` и может забрать/отдать изменения.
- Режим **«только телефон»** — полноценный для согласованного набора функций (см. матрицу в §4).

### Не-цели (первая версия)

- Замена десктопа на телефоне для всех premium-фич питания (прогнозы, сложные шаблоны, cut/bulk).
- Real-time push с ПК на телефон (у Яндекс.Диска нет push → только опрос).
- Двусторонний merge произвольных SQL-дампов `workouts.db` ↔ `myhealth.db` (разные схемы — только **общий формат пакета**).
- Обязательный публичный VPS (опциональный «legacy API sync» можно оставить как продвинутый режим).

### Три режима работы (итоговая модель)

| Режим | Вход | Данные | Синхронизация |
|-------|------|--------|----------------|
| **A. Автономный** (целевой) | Нативный Яндекс | `myhealth.db` | По кнопке → Диск |
| **B. Облако без ПК** | Яндекс | Локально + Диск | Авто/ручной Диск |
| **C. Legacy (опционально)** | API OAuth | Локально + `SyncService` → FastAPI | Как сейчас (2026) |

---

## 2. Целевая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Android Forma                                               │
│  UI → LocalRepository → myhealth.db                          │
│       FormaSyncEngine ──────────────────────────────┐        │
└──────────────────────────────────────────────────────│────────┘
                                                       │
                    Яндекс OAuth (login + Disk)        ▼
              ┌──────────────────────────────────────────────┐
              │  app:/FormaSync/{yandex_uid}/                 │
              │    manifest.json                              │
              │    packages/*.zip                             │
              └──────────────────────────────────────────────┘
                                                       ▲
              ┌──────────────────────────────────────────────┐
              │  ПК (опционально): FastAPI + workouts.db      │
              │    FormaSyncImporter, poll manifest           │
              └──────────────────────────────────────────────┘
```

**Правило:** телефон не «знает» про ПК. ПК не «знает» про телефон. Общий контракт — **папка на Диске одного `yandex_uid`**.

**Уже есть в репозитории (база для плана):**

| Компонент | Где |
|-----------|-----|
| SQLite на телефоне | `mobile/src/database/` |
| Очередь `synced=0`, офлайн | `mobile/src/services/SyncService.ts` |
| Нативный OAuth Диска | `mobile/src/services/cloudOAuth.ts`, `CloudSyncService.ts` |
| Бэкап целой `myhealth.db` на Диск | `mobile/src/services/cloud/yandexDiskApi.ts`, папка `FormaBackups` |
| Бэкап `workouts.db` на ПК | `backend/services/cloud_backup_service.py` |
| Пользователь по `cloud_user_id` | `backend/services/auth_user_service.py` |

---

## 3. Контракт FormaSync

### 3.1 Путь на Яндекс.Диске

Унифицировать с существующими папками (`FormaBackups` на mobile, `/MyHealthDashboard/Backups` на desktop):

```
app:/FormaSync/{yandex_uid}/
  manifest.json
  packages/
    000042-mobile.zip
    000043-desktop.zip
  history/                 # опционально: старые manifest
```

`yandex_uid` — из `GET https://cloud-api.yandex.net/v1/disk/` (как в `backend/services/cloud_identity_service.py`).

### 3.2 `manifest.json`

```json
{
  "schema_version": 1,
  "revision": 43,
  "updated_at": "2026-05-27T15:30:00Z",
  "source_device": "mobile",
  "source_device_id": "android-uuid",
  "package": "packages/000043-mobile.zip",
  "package_sha256": "...",
  "entities_summary": {
    "food_entries": 12,
    "strength_workouts": 2
  }
}
```

ПК и телефон хранят локально `last_seen_revision` в `sync_meta` (mobile) / аналог на backend.

### 3.3 Содержимое пакета (ZIP)

Не целая БД, а **набор JSON** + опционально вложения:

```
package/
  meta.json
  changes/
    food_entries.jsonl
    body_metrics.jsonl
    strength_workouts.jsonl
    stretching_log.jsonl
    bracelet_calories.jsonl
    user_profile.json
  catalog/
    products_snapshot.json    # опционально, редко
```

Строка JSONL (пример):

```json
{
  "id": "food:local:15",
  "server_id": 120,
  "updated_at": "2026-05-27T12:00:00Z",
  "deleted": false,
  "payload": { }
}
```

`id` — глобальный стабильный ключ (`entity:origin:localId`).

### 3.4 Правила merge (v1)

- По умолчанию: **побеждает запись с более поздним `updated_at`**.
- При равенстве: **конфликт** → UI (`mobile/src/database/conflictStore.ts`).
- Удаления: `deleted: true` + `updated_at` (tombstone).
- Импорт на ПК: транзакция в `workouts.db`, bump `revision`, при «отправить на Диск» — пакет `source: desktop`.

### 3.5 Версионирование

- `schema_version` в manifest и в `meta.json` пакета.
- Несовместимые изменения → миграция формата пакета, не молчаливый сбой.

Детальные JSON Schema и контракт пакета — см. [FORMA_SYNC.md](./FORMA_SYNC.md) (создан, v1).

---

## 4. Матрица данных (v1)

| Сущность | Mobile local | В пакет v1 | Desktop import | Примечание |
|----------|--------------|------------|------------------|------------|
| Записи питания | `food_entries` | Да | Да | Ядро |
| Калории браслета | `bracelet_calories_*` | Да | Да | |
| Силовые тренировки | `strength_workouts` | Да | Да | |
| Замеры тела | `body_metrics` | Да | Да | |
| Растяжка | `stretching_log` | Да | Да | |
| Профиль/цели (mobile) | settings / cache | Частично | Частично | Только общие поля |
| Кардио (FIT) | cache | v2 | FIT отдельно | `CLOUD_WORKOUTS_FOLDER` на ПК |
| Цикл / premium аналитика | API-only | v2+ | Нет в v1 | |
| Справочник продуктов | API + cache | snapshot | merge by id | Минимум встроенный офлайн |
| Polar / Health Connect | устройство | Нет | — | Локально на телефоне |

**MVP автономности:** Food + Strength + Body + Stretching + Bracelet + базовый профиль.

---

## 5. Фазы реализации

### Фаза 0 — Спецификация (3–5 дней)

- Утвердить FormaSync, manifest, JSONL по сущностям.
- Таблица соответствия `payload_json` (mobile) ↔ таблицы `workouts.db`.
- Решить судьбу legacy API sync (переключатель vs удаление).
- Документ `docs/FORMA_SYNC.md` + JSON Schema + фикстуры для тестов.

**Готово, когда:** unit-тест «пакет mobile → импорт в SQLite ПК» без UI.

---

### Фаза 1 — Нативный вход без сервера (1–2 недели)

| Задача | Модули |
|--------|--------|
| OAuth `login:email` + disk | `mobile/src/services/cloudOAuth.ts` |
| `GET disk/` → uid, email → сессия | новый `mobile/src/auth/yandexIdentity.ts` |
| Сессия в Keychain + AsyncStorage | `session.ts`, `AuthContext.tsx` |
| Убрать обязательность API URL на входе | `LoginScreen.tsx`, `apiBase.ts` |
| Локальный ключ пользователя | `api/client.ts` → `getLocalUserKey()` |

`SyncService` к API — выключить по флагу `syncMode: 'disk' | 'api' | 'off'`.

**Готово, когда:** APK без API URL → вход Яндекс → запись еды offline.

---

### Фаза 2 — Local-first (2–3 недели)

Экраны читают из `database/*Store`, запись всегда local → `synced=0`.

| Репозиторий | Store |
|-------------|-------|
| `LocalFoodRepository` | `foodStore` |
| `LocalStrengthRepository` | `strengthStore` |
| `LocalBodyRepository` | `bodyStore` |
| … | аналогично |

Рефакторинг `mobile/src/api/*.ts`: сеть не вызывать в режиме `disk`/`off`.

`OfflineContext`: автосинк к API по умолчанию **выключен**; dirty только для Диска.

**Готово, когда:** airplane mode 24 ч — дневник + тренировка без HTTP.

---

### Фаза 3 — FormaSyncEngine на mobile (1–2 недели)

Новые модули:

- `mobile/src/sync/FormaSyncEngine.ts`
- `mobile/src/sync/packageBuilder.ts`
- `mobile/src/sync/packageApplier.ts`
- `mobile/src/sync/manifest.ts`
- Расширить `yandexDiskApi.ts` (произвольные пути, не только `backup_*.db`)

UI: `SyncAndCloudSettings`, `BackupSettings` — «Отправить в облако» / «Забрать» / revision / конфликты. Полный бэкап `.db` — режим «аварийный».

**Готово, когда:** телефон A export → телефон B (тот же Яндекс) import.

---

### Фаза 4 — Импорт/экспорт на ПК (2–3 недели)

| Задача | Модуль |
|--------|--------|
| Import/export пакета | `backend/services/forma_sync_service.py` |
| REST | `backend/routers/forma_sync.py` |
| Маппинг JSONL → SQL | рядом с food/strength services |
| UI | `frontend/.../CloudStorageSection.tsx` |

Использовать тот же `yandex_uid`, что при входе на десктопе (`find_or_create_cloud_user`). Токен Диска уже в БД — отдельный OAuth не нужен, если облако подключено.

**Готово, когда:** запись на телефоне → manifest на Диске → импорт в браузере на ПК.

---

### Фаза 5 — Конфликты, миграция (1–2 недели)

- UI конфликтов для disk-sync (`ConflictCenterModal`).
- Checksum, rollback при failed import.
- Миграция: backup `myhealth.db` + привязка `yandex_uid` к старому API `user_id`.
- Лог синхронизации.

---

### Фаза 6 — Ограничения «урезанной БД» (после MVP)

- Список в UI: что недоступно без ПК.
- Локальный `products_local` для офлайн-поиска.
- Barcode: кэш сканов; полный каталог — online или snapshot.

---

### Фаза 7 — Legacy API sync (опционально, ~1 неделя)

- Настройка «домашний сервер» (URL + OAuth как сейчас).
- Отдельно от FormaSync, не в одном автопайплайне.

---

### Фаза 8 — Тесты и документация

- Unit: build/apply пакета, merge, manifest.
- Integration: mobile export → backend import fixture.
- E2E: 2 устройства + Диск.
- Обновить `MOBILE.md`, `CLOUD_SYNC_ANDROID.md`, `SETUP.md`.

---

## 6. Зависимости фаз

```
Фаза 0 (спека)
    ├── Фаза 1 (вход) → Фаза 2 (local-first) → Фаза 3 (Disk mobile)
    └── Фаза 4 (ПК)     — параллельно после фазы 0
              └── Фаза 5 (конфликты) после 3+4
```

---

## 7. Риски

| Риск | Митигация |
|------|-----------|
| Разные `user_id` | Везде ключ `yandex_uid`; импорт только в cloud-пользователя ПК |
| Большие пакеты | Инкрементальные JSONL; zip; без whole products DB |
| Дубли | Global `id` + таблица `forma_sync_map` |
| Путаница backup .db vs FormaSync | Разные подписи в UI |
| Нет push на ПК | Poll / кнопка «Синхронизировать» |
| Android убил фон | WorkManager или только ручной sync в v1 |

---

## 8. Критерии готовности

### MVP

- [ ] Вход Яндекс без API URL
- [ ] Дневник + силовые offline local-first
- [ ] Export/import пакета на Диск вручную
- [ ] ПК: импорт в `workouts.db`
- [ ] Manifest: «есть новее на Диске»

### Full v1

- [ ] Все сущности матрицы v1
- [ ] Конфликты + tombstone
- [ ] Desktop export на Диск
- [x] `FORMA_SYNC.md` + тесты (базовые — см. `mobile/src/sync/__tests__/`)
- [ ] Legacy API — опция

---

## 9. Оценка сроков (1 разработчик)

| Блок | Срок |
|------|------|
| 0 Спецификация | ~1 неделя |
| 1 Вход | 1–2 недели |
| 2 Local-first | 2–3 недели |
| 3 Mobile Disk | 1–2 недели |
| 4 Desktop | 2–3 недели |
| 5–6 Полировка | 2–3 недели |
| **MVP** | **~8–10 недель** |
| **Full v1** | **~12–16 недель** |

---

## 10. Рекомендуемый порядок старта (когда вернёмся к теме)

1. ~~Фаза 0 — `docs/FORMA_SYNC.md`~~ — **done**; далее: conflict merge, Play release QA.
2. Фаза 1 — нативный вход.
3. Фаза 2 — food + strength local-first.
4. Фазы 3 + 4 параллельно — один тест-пакет end-to-end.
5. Остальные сущности и polish.

---

## 11. Что не менять без нужды

- `CloudSyncService` backup целой БД — disaster recovery.
- Polar / Health Connect — вне FormaSync v1.
- Десктопный `backup_to_yandex` для `workouts.db` — сосуществует; в UI различать «полный бэкап ПК» и «синхронизация с телефоном».

---

*Документ создан: май 2026. Обновлять при изменении контракта FormaSync или при старте реализации.*
