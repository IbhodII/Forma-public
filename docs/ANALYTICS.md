# ANALYTICS.md

Аналитика Forma: training load (CTL/ATL/TSB), TRIMP, recovery, энергия, шаги, сон, пульс, силовая аналитика. Состояние после cleanup **2026-06**: CTL/TRIMP formulas unchanged; energy calibration and future expansion are documented separately below.

**UI:** [DESKTOP_UI.md](./DESKTOP_UI.md) · **Mobile:** [MOBILE.md](./MOBILE.md) · **API:** `GET /api/analytics/*`

Last updated: 2026-06-09.

---

## Метрики (cardio TRIMP)

| Метрика | Статус | Примечание |
|---------|--------|------------|
| CTL | Working | 42-day EWMA на daily load |
| ATL | Working | ~7-day EWMA |
| TSB | Working | CTL − ATL |
| TRIMP | Working | Edwards, per workout + daily sum |

**Ограничение модели:** CTL/ATL/TSB только по кардио TRIMP; силовая нагрузка не входит в EWMA (силовой объём / 1ПМ — отдельные API/UI).

---

## Формулы (неизменны в cleanup)

```
daily_load(d) = sum(TRIMP cardio on d) × recovery_multiplier(d)   // cycle optional

CTL_d = CTL_{d-1} × (41/42) + daily_load(d) / 42
ATL_d = ATL_{d-1} × (6/7)  + daily_load(d) / 7
TSB_d = CTL_d − ATL_d
```

---

## Backend (desktop API)

### Query layer

[`backend/services/analytics_query.py`](../backend/services/analytics_query.py):

| Функция | Назначение |
|---------|------------|
| `has_cardio_workouts_in_range` / `has_cardio_trimp_data` | Быстрый EXISTS до тяжёлой работы |
| `get_ctl_atl_tsb_series(days)` | Guards → daily TRIMP → EWMA |
| `build_ctl_current` | Единый `current` для API и dashboard |
| `get_ctl_atl_tsb_payload` | `items` + `current` |

Потребители: `routers/analytics.py` (`GET /ctl`), `dashboard_home_service`, `database_post_verify` (smoke только при наличии данных).

### TRIMP refresh guard

[`cardio_service`](../backend/services/cardio_service.py):

- `count_missing_trimp()` — один COUNT
- `_refresh_missing_trimp_if_needed()` — `refresh_missing_trimp` только если missing > 0

Раньше каждый запрос CTL мог запускать `refresh_missing_trimp(500)` на пустой БД — основная причина «зависания».

### Другие early exits (2026-06)

- `get_zone_time_distribution` — return если нет HR-тренировок в периоде
- `passive_hr_service.get_daily_stats` — COUNT перед загрузкой всех samples
- `strength_hr_analytics` — guard при 0 HR-сессий

### Legacy entry

`analytics_service.get_ctl_atl_tsb` → делегат в `analytics_query`.

**Не объединяли:** `get_calories_by_day` vs `food_service._workout_calories_for_range` (разный COALESCE) — historical note: [archive/CLEANUP.md](./archive/CLEANUP.md).

---

## Desktop UI

| Surface | Route | Загрузка данных |
|---------|-------|-----------------|
| Analytics | `/analytics` | [`useAnalyticsQueries`](../frontend/src/hooks/analytics/useAnalyticsQueries.ts) — CTL, TRIMP, zones, passive HR, sleep |
| Home | `/home` | `GET /dashboard/home` → `useDashboardTrainingLoad` (CTL из payload, **без** второго `fetchCtlAtlTsb`) |

- Окно CTL по умолчанию: **90** дней (`CTL_ATL_TSB_DEFAULT_DAYS`, `trainingLoadMetrics.ts`).
- Секции analytics: lazy via `useAnalyticsSectionActive` (не переписывали layout).
- Error/empty: TRIMP, zones, passive HR, sleep (2026-06).
- Passive HR invalidation: `queryKey` prefix `["analytics", "passive-hr"]` (исправлено с `passiveHeartRate`).

**Удалено (мёртвый код):** `AthleteDashboardHero.tsx`, `AnalyticsPage.tsx` re-export, `StrengthProgressTable.tsx`, часть FoodDiary premium blocks.

---

## Route & Workout Telemetry Inspection

**Phase 1 (shipped 2026-06-09):** Running and cycling map tooltips use `RoutePointTelemetry` + backend `merge_telemetry_into_track_points` to show available per-point metrics (HR, speed, elevation, power, cadence, temperature, distance, elapsed time) when present.

**Phase 2 (planned, P2):** Map ↔ chart synchronization and replay scrubbing — not yet implemented.

Cardio activities may store dense per-point telemetry (FIT, Polar, GPX/TCX, Health Connect). Speed-colored routes and separate charts use this data; point popups now expose the metric set dynamically (hide absent fields).

**Point popup / inspector fields** (show when present for the activity):

| Metric | Notes |
|--------|--------|
| Time / elapsed time | Wall-clock or offset from start |
| Distance from start | Cumulative along route |
| Speed | km/h; running may also show pace |
| Heart rate | From HR stream or enriched GeoJSON |
| Cadence | RPM/SPM when imported |
| Elevation | meters; grade/slope when derivable |
| Power | Sensor or estimated (`power_source`) |
| Temperature | When sensor/file provides it |
| Other | Provider-specific extensions |

**UX principles:** dynamic field list; no empty placeholders; source-aware labels (metric vs american units).

**Future analytics layer (architecture should stay compatible):**

- map selection ↔ chart highlight (speed, HR, elevation, power);
- chart selection ↔ map marker;
- synchronized scrubbing during route replay.

Roadmap: [ROADMAP.md](./ROADMAP.md) — Route Point Telemetry & Map Inspection. Implementation reference: [archive/BIKE.md](./archive/BIKE.md), [WORKOUTS.md](./WORKOUTS.md).

---

## Energy Expenditure and Calorie Calibration

Current foundation:

- Raw imported calories are preserved.
- Workout calorie priority remains: `bracelet daily calories - bracelet workout calories + Polar/chest effective workout calories`.
- `calibration_factor` is applied after that replacement to the final activity component, avoiding double-counting.
- `calorie_calibration_history` stores aggregate windows and factors.

Planned automatic workflow, priority **P1**:

1. Every 14 days collect body weight history.
2. Calculate a smoothed/trend weight change.
3. Estimate actual energy balance from observed weight change.
4. Compare predicted deficit/surplus vs observed deficit/surplus.
5. Recalculate correction factor.
6. Save calibration result and log event.
7. Expose last calibration date, current correction factor, confidence and window length.

Safety requirements:

- Never overwrite imported calories.
- Never overwrite Polar calories.
- Never overwrite Health Connect calories.
- Never overwrite workout calorie data.
- Calibration updates correction coefficients and logs only.

Long-term goal: self-correcting energy expenditure estimation.

---

## Historical Steps and Xiaomi Correction

Historical Xiaomi/Mi imports are planned. Analytics must treat raw vs corrected values explicitly.

Known issue: Xiaomi daily steps may be duplicated in approximately **September 2023 – December 2023**. Existing Forma monthly totals are considered authoritative.

Correction rule:

```text
if xiaomi_month_total > existing_forma_month_total:
    excess_steps = xiaomi_month_total - existing_forma_month_total
    daily_correction = excess_steps / days_with_records
    corrected_daily_steps = max(0, imported_daily_steps - daily_correction)
```

Analytics should use corrected daily values for trends/totals while preserving raw imported values for audit. Correction logs must make the process reversible.

Details: [HISTORICAL_IMPORTS.md](./HISTORICAL_IMPORTS.md).

---

## Mobile

| Surface | Tab | Данные |
|---------|-----|--------|
| Analytics | «Аналитика» | Local-first |
| Home | «Главная» | Companion + insights |

### Query layer

[`mobile/src/analytics/analyticsQuery.ts`](../mobile/src/analytics/analyticsQuery.ts) — `queryCtlAtlTsb`, `queryCardioTrimp`, calories, zone time: `hasAnyAnalyticsDataInRange` → facts → compute → empty defaults.

[`mobile/src/api/analytics.ts`](../mobile/src/api/analytics.ts) — тонкие re-export.

**Fix:** `initDB` import в `localAnalyticsAdapter.ts` (раньше ReferenceError на guard).

### React Query keys (dedup)

`queryKeys.analyticsCtl(days)` — один ключ для `AnalyticsScreen`, `LoadAnalyticsSection`, `useInsights`, home (`90`).

Раньше: `analytics-ctl`, `insights-ctl`, `ctl-atl-tsb` — до 3 параллельных compute на одном экране.

### Empty / loading

- `AnalyticsScreen`: `periodReady` из `useAnalyticsPeriod`; empty CTL hero при `< 2` точек
- `ProgressAnalyticsSection`: `AnalyticsEmptyState` при пустом progress
- Timeout 5 s на local facts (без изменения формул)

### Cache

`saveAnalyticsCache` **убран** из write-path (HC sync, API) — read-path не использовался; меньше риска stale cache.

**Engine:** `mobile/src/analytics-engine/` (`computeCtlAtlTsb`) — формулы не трогали.

---

## Platform divergence (остаётся)

| Область | Desktop | Mobile |
|---------|---------|--------|
| Источник CTL | Backend DB + API | Local SQLite + HC/workouts facts |
| Strength HR analytics | Sub-tab + API | Нет parity |
| Passive HR (HC) | API + panels | Упрощённо / HC metrics |
| Recovery advice | `recoveryAdvice.ts` + HC gates | `utils/recoveryAdvice.ts` (короче) |
| Plotly / deep charts | Да | chart-kit |

Консистентность **чисел** CTL между mobile local и desktop API при одних данных **не гарантирована** (разные pipelines).

---

## Future Analytics Expansion

Planned ideas after mobile/HC/sync stabilization:

| Area | Ideas |
|------|-------|
| Steps | Most active weekday, historical activity patterns, lifetime statistics |
| Sleep | Sleep history, trend analysis, regularity metrics |
| Heart rate | Resting HR trends, long-term cardiovascular metrics |
| Calibration | Confidence score, factor history chart, device accuracy insight |
| Imports | Raw vs corrected historical source audit |
| Recovery-aware analytics | Recovery Score, Recovery Modifier, Adjusted ATL, Readiness Score, Fatigue Risk |
| Metric explainability | "Why?" explanations, contributor breakdowns, trend explanations |

These are not release blockers. They should build on validated Health Connect and historical import data.

---

## Recovery-Aware Analytics Layer

Priority: **P2 / Future Enhancement**. Status: **Planned / Not Started**.

This is a planned analytics v2 interpretation layer. It must **not** replace or mutate the existing ATL / CTL / TSB model. Raw training load metrics remain calculated from training load / TRIMP as they are now:

- `CTL` = long-term fitness / chronic load.
- `ATL` = short-term training fatigue.
- `TSB` = `CTL - ATL`.

Recovery-aware analytics should add derived interpretation on top:

- `Recovery Score` = recovery state based on sleep, heart metrics, energy balance and body trend.
- `Recovery Modifier` = adjustment factor used to interpret short-term fatigue.
- `Adjusted ATL` = ATL interpreted through current recovery state.
- `Readiness Score` = practical daily readiness derived from CTL, ATL, TSB and Recovery Score.

### Planned Inputs

Required / high-value:

- sleep duration;
- sleep consistency;
- resting heart rate;
- night average heart rate;
- training load / TRIMP;
- daily steps;
- calorie balance;
- body weight trend.

Optional / future:

- HRV;
- sleep stages;
- subjective fatigue;
- illness flags;
- soreness / DOMS;
- stress metrics.

### Planned Outputs

- Recovery Score `0-100`;
- Recovery Modifier;
- Adjusted ATL;
- Readiness Score;
- Fatigue Risk;
- Overreaching Warning;
- Recovery Trend;
- Energy Availability Warning.

### Interpretation Rules

- Poor sleep should increase fatigue interpretation.
- Elevated resting heart rate compared to personal baseline should increase fatigue risk.
- Elevated night heart rate should reduce recovery score.
- Low HRV compared to personal baseline should reduce recovery score if HRV data is available.
- High step count should contribute to non-training load.
- Large calorie deficit over multiple days should increase fatigue risk.
- Rapid body weight drop should increase recovery warning severity.
- Good sleep and stable heart metrics should improve readiness interpretation, but should not erase real training load.

### Personal Baselines

Recovery calculations must use personal baselines, not fixed universal thresholds:

- resting heart rate compared against the user's own rolling baseline;
- night heart rate compared against the user's own rolling baseline;
- sleep duration evaluated against user history and recommended minimums;
- body weight changes smoothed using trend data.

### Raw Data Preservation

Recovery-aware metrics must never corrupt raw training load or health history. Preserve raw:

- TRIMP;
- ATL;
- CTL;
- TSB;
- sleep records;
- heart rate records;
- steps;
- weight.

Recovery-aware values should be stored or displayed as derived metrics.

### Health Connect Dependency

This feature depends on reliable Health Connect and historical import data for sleep, continuous heart rate, resting heart rate, steps and HRV where available. It should be implemented only after Health Connect validation and historical Xiaomi import validation are complete.

### Example Scenarios

Classic ATL / CTL / TSB may look acceptable, but Forma should raise a recovery warning or reduce readiness if:

- sleep has been poor for several days;
- resting heart rate is above personal baseline;
- calorie deficit is large;
- body weight is dropping quickly.

Forma may show high fatigue but acceptable recovery state if ATL is high after a hard block, but:

- sleep is good;
- resting heart rate is normal;
- night heart rate is stable;
- calories are adequate.

---

## Metric Explainability & Transparency

Priority: **P2 / Future Enhancement**. Status: **Planned / Not Started**.

Purpose: provide clear explanations for advanced analytics metrics so users understand where values come from instead of seeing unexplained numbers. This is a planned analytics UX improvement, not a current feature.

Especially important for:

- ATL;
- CTL;
- TSB;
- Recovery Score (planned);
- Readiness Score (planned);
- Fatigue Risk (planned).

Every advanced metric should answer:

1. What is this metric?
2. What data contributes to it?
3. What time period is used?
4. Why is the current value high or low?
5. What are the main contributing factors?

### Example: ATL

Current display:

```text
ATL = 73
```

Future explainable display:

```text
ATL = 73

Meaning:
Short-term training fatigue estimate.

Calculated from:
- TRIMP
- Cardio load
- Strength training load

Time window:
Approximately last 7 days.

Main contributors:
- Cycling workout (high load)
- Leg workout (moderate load)
- Running session (moderate load)
```

### Example: Recovery Score

```text
Recovery Score = 42

Positive:
+ Adequate calorie intake
+ Stable body weight trend

Negative:
- Poor sleep for 3 consecutive days
- Elevated resting heart rate
- Increased night heart rate

Primary limiting factor:
Sleep quality and recovery deficit.
```

### Example: Readiness Score

```text
Readiness = Moderate

Training Load:
High ATL

Recovery:
Moderate

Sleep:
Good

Heart Metrics:
Normal

Energy Availability:
Adequate

Interpretation:
User is carrying significant fatigue but recovery signals remain acceptable.
```

### Transparency Requirements

Future analytics metrics should avoid black-box scores. Whenever possible:

- show contributing factors;
- show positive and negative drivers;
- show major reasons for warnings;
- explain score changes over time.

Users should be able to inspect why a value changed rather than only seeing the final number.

### Future UI Considerations

Potential UX:

- "Why?" button on analytics cards;
- expandable explanations;
- contributor breakdown;
- trend explanations;
- warning rationale.

Example user questions:

- "Why is readiness low?"
- "Why did recovery score drop?"
- "Why is fatigue risk high?"

This transparency layer should also apply to the planned Recovery-Aware Analytics Layer. Recovery-aware metrics must display the major factors influencing recovery state instead of presenting unexplained scores.

---

## Проверки после изменений

| Check | Результат (2026-06) |
|-------|---------------------|
| `pytest test_analytics_query_empty` + cardio scope | pass |
| `npm run bundle:check` (mobile) | pass |
| `npx vite build` (desktop) | pass |
| Пустая DB → CTL API | быстрый `items: []`, без refresh (test) |

Ручной smoke: открыть Analytics на пустой/новой БД — empty, не бесконечный loader.

---

## Related files

| Layer | Desktop | Mobile |
|-------|---------|--------|
| CTL/TRIMP core | `analytics_query.py`, `cardio_service.py`, `utils/hr_profile.py` | `analytics-engine/load.ts`, `analyticsQuery.ts` |
| UI hooks | `useAnalyticsQueries.ts`, `useDashboardTrainingLoad.ts` | `queryKeys.ts`, `useInsights.ts` |
| Docs | [archive/CLEANUP.md](./archive/CLEANUP.md) historical cleanup section | [PLATFORMS.md](./PLATFORMS.md) |
