# RELEASE_READINESS.md

Чеклист готовности Forma к desktop release use и дальнейшей mobile/HC стабилизации.

Last updated: **2026-06-05**.

---

## Current Release Readiness Status

Desktop is largely feature-complete, but the project is **not fully release-clean** because of open critical/product bugs and validation gaps.

### Blockers / Must Fix Before Broad Release

| Priority | Blocker | Status | Reference |
|----------|---------|--------|-----------|
| P0 | Body measurements chart/history edit crash | Open | [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |
| P1 | Exercise template creation loses block structure | Open | [KNOWN_ISSUES.md](./KNOWN_ISSUES.md), [WORKOUTS.md](./WORKOUTS.md) |
| P1 | Goal deficit validation rejects >60 kcal/kg fat | Open | [KNOWN_ISSUES.md](./KNOWN_ISSUES.md), [NUTRITION.md](./NUTRITION.md) |
| P1 | Health Connect validation incomplete | Open | [HEALTH_CONNECT.md](./HEALTH_CONNECT.md) |
| P1 | Synchronization validation incomplete | Open | [FORMA_SYNC.md](./FORMA_SYNC.md) |

### Not Blockers For Desktop-Only Smoke

- Historical Xiaomi import is planned, not required for desktop installer smoke.
- Automatic calorie calibration scheduling is planned; manual/adaptive foundation exists.
- Future analytics expansion is roadmap work.
- Recovery-aware analytics and metric explainability are P2 future enhancements, not release blockers.

---

## Desktop Release Gate

### Automated baseline (до UI-правок)

```bash
python -m pytest backend/tests/test_database_import_tasks.py \
  backend/tests/test_large_database_import.py \
  backend/tests/test_db_import_unique_conflicts.py \
  backend/tests/test_db_import_natural_merge.py \
  backend/tests/test_import_user_reconciliation.py -q
```

### UI matrix (`desktop_app` / packaged EXE)

| Surface | Release | Dev / admin |
|---------|---------|-------------|
| Создать резервную копию (ZIP) | Да — «Резервные копии» | Да |
| Восстановить из ZIP | Да — тот же раздел | Да (также «Импорт» в admin) |
| Scheduled local backup | Да | Да |
| FIT/GPX import | Да — «Импорт и экспорт» | Да |
| JSON `forma_backup_v1` | **Нет** | Да (Developer Tools) |
| 2-file DB import | **Нет** | Да (Developer Tools) |
| Mini DB export | **Нет** | Да (Developer Tools) |
| Developer Tools tab | **Нет** | Да (`admin_browser`) |
| Local admin login button | **Нет** (auto `fetchDesktopLogin`) | Да |

Флаги: [`frontend/src/config/clientCapabilities.ts`](../frontend/src/config/clientCapabilities.ts).

### Large DB import (§11–17)

1. Подготовить ZIP >150 МБ (или пару `.db` в dev).
2. `GET /api/health` → **200** (не блокируется stale `.db-import.lock`).
3. Stage ZIP → `POST /api/database/import/start` mode **replace**.
4. Poll до `status: done`; проверить `workout_visibility` в report.
5. После импорта: тренировки/питание видны для `user_id` сессии.
6. Не регрессить: `updated_at` schema-aware merge, steps legacy `UNIQUE(date)`.

### Packaged smoke (manual)

1. `cd frontend && npm run desktop:dist` (или готовый installer).
2. Первый запуск: без экрана admin login; сессия `user_id=1`.
3. Settings → Данные → Резервные копии → **Создать резервную копию** → ZIP на диск.
4. **Восстановить из резервной копии** → тот же ZIP, Replace → job done.
5. Restart app → `GET /api/health` 200.
6. Убедиться: нет mini DB / JSON / 2-file в UI.
7. `/workouts`: создать обычную тренировку; проверить prefill веса/повторов/разминки из истории.
8. `/workouts`: создать/открыть шаблон с суперсетом или кругом; проверить компактный блок, раскрытие и редактирование текущих подходов без входа в структуру.
9. `/workouts` → «Набор упражнений»: проверить простой список, структуру блоков и autocomplete упражнений.
10. Каталог упражнений: edit/delete мусорной записи; used exercise должен архивироваться, история не должна меняться.
11. `/food`: открыть неделю, день, продукт/составное блюдо, meal plan apply smoke.
12. `/body`: open measurements chart/history. Do **not** sign off until edit action from chart/history no longer crashes.
13. `/workouts`: create a new exercise template/set with normal + superset/circuit blocks and verify names/order/exercise assignments are preserved.

### Этап 1 regression (после изменений)

```bash
python -m pytest backend/tests/test_database_import_tasks.py \
  backend/tests/test_large_database_import.py \
  backend/tests/test_db_import_unique_conflicts.py \
  backend/tests/test_database_export.py \
  backend/tests/test_release_client_capabilities.py -q
cd frontend && npm run build
```

---

## Gate перед финальной сборкой

Все обязательны:

1. Import/export стабилен (pytest + ручной merge при необходимости).
2. ZIP backup/restore (create + restore + restart).
3. Large DB import без регрессии.
4. Release UI без dev-only путей в desktop.
5. Exe smoke (см. выше).
6. Workout blocks/supersets/circuits smoke green.
7. Food diary / meal plans smoke green.
8. Body measurements chart/history edit smoke green.
9. Exercise template creation preserves block structure.
10. Nutrition goal deficit accepts values up to 70 kcal/kg fat and rejects >70 with a user-friendly message.

---

## Mobile / HC / Sync Readiness

These gates are for the current project direction after desktop stabilization:

| Area | Required validation |
|------|---------------------|
| Mobile dashboard | Everyday summary works without desktop API dependency |
| Mobile nutrition | Food logging, OpenFoodFacts, daily calories |
| Mobile workouts | Set/weight entry and cardio entry for running/cycling/swimming |
| Swimming | SWOLF supported |
| Mobile body | Measurements, history, charts |
| Mobile analytics | Key analytics accessible locally |
| Cycle | Available when female profile selected |
| Week calendar | Saturday default verified |
| Health Connect | Sleep, HR, steps, calories and workouts validated by provider |
| FormaSync | Mobile ↔ desktop/cloud roundtrip, conflicts and HC day rollups verified |

---

## Sign-off

| Check | Owner | Date |
|-------|-------|------|
| Regression pytest green | | |
| Frontend build green | | |
| EXE smoke | | |
| Backup/restore ZIP roundtrip | | |
| Workouts blocks smoke | | |
| Food/meal plans smoke | | |
| Body measurements edit smoke | | |
| Exercise template block preservation | | |
| Nutrition goal deficit validation | | |
| HC validation smoke | | |
| FormaSync validation smoke | | |
