# ROADMAP.md

Backlog Forma после Desktop RC и текущего цикла mobile/Health Connect planning. Статус — по коду, [KNOWN_ISSUES.md](./KNOWN_ISSUES.md), [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md).

Last updated: **2026-06-05**.

---

## Priority Order

1. Mobile application completion.
2. Health Connect validation and stabilization.
3. Synchronization validation.
4. Historical Xiaomi import.
5. Bug fixing and cleanup.
6. Automatic calorie calibration.
7. Future analytics expansion.

---

## P0 / P1 Bugs

| Priority | Item | Status | Target |
|----------|------|--------|--------|
| P0 | Body measurements chart/history edit crash | Open | Measurements editable from chart/history without app crash |
| P1 | Exercise template creation loses block structure | Open | Preserve block order, names, exercise assignments and generated workout structure |
| P1 | Goal deficit validation rejects >60 kcal/kg fat | Open | Allow values up to 70; reject >70 with friendly validation, not HTTP 422 within range |
| P1 | Health Connect validation | Open | Sleep, HR, steps and kcal verified across mobile local, FormaSync and desktop views |
| P1 | Synchronization validation | Open | Multi-device FormaSync roundtrip, conflict visibility, HC day rollups |

Details and workarounds: [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). Release gates: [RELEASE_READINESS.md](./RELEASE_READINESS.md).

---

## Mobile Application Completion

Scope: [MOBILE.md](./MOBILE.md). Desktop remains the reference for some formulas/imports, but mobile must become a usable standalone daily app.

- Dashboard with near feature parity for everyday status.
- Nutrition: daily calorie tracking, OpenFoodFacts, food logging.
- Workouts: workout execution, set entry, weight entry, cardio entry.
- Cardio types: running, cycling, swimming; swimming must support SWOLF.
- Body: measurements, history, charts.
- Analytics available without desktop.
- Cycle tracking when female profile selected.
- Week start default: Saturday.

---

## Health Connect Stabilization

- Validate sleep import.
- Validate continuous heart rate import.
- Validate step import and duplicate behavior.
- Validate calorie import and source ownership.
- Verify synchronization from mobile local DB through FormaSync and/or legacy API.
- Resolve open questions: source attribution, duplicate prevention, metric ownership, conflict resolution.

Details: [HEALTH_CONNECT.md](./HEALTH_CONNECT.md), [FORMA_SYNC.md](./FORMA_SYNC.md).

---

## Historical Xiaomi Import

Priority: **P1**. Status: **Planned**.

Purpose: restore historical data before current Forma records from Mi Fitness, Zepp Life and Xiaomi exports.

Initial data:

- Activity: daily steps, running workouts.
- Health: sleep history, continuous heart rate history.
- Body composition before `2023-08-05`: weight, body fat %, muscle mass.

Optional later: stress, SpO2, proprietary wellness metrics.

Import rules: merge with existing records, avoid duplicates, never blindly overwrite data, preserve raw imported values where possible. Known step duplication period (approx. September 2023 to December 2023) must use the correction algorithm in [HISTORICAL_IMPORTS.md](./HISTORICAL_IMPORTS.md).

---

## Automatic Calorie Calibration

Priority: **P1**. Status: **Planned automation**.

Current foundation: manual/adaptive recalculation exists with `calorie_calibration_history` and raw calorie preservation. Next step is a scheduled workflow every 14 days:

1. Collect weight history.
2. Calculate trend.
3. Estimate observed energy balance.
4. Compare predicted vs observed deficit/surplus.
5. Recalculate correction factor.
6. Save result and event log.
7. Show factor, confidence, date and window length to the user.

Safety rule: never overwrite imported calories, Polar calories, Health Connect calories or workout calorie rows. Calibration only updates correction coefficients and logs.

Details: [ANALYTICS.md](./ANALYTICS.md), [NUTRITION.md](./NUTRITION.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Future Analytics Expansion

| Item | Notes |
|------|-------|
| Steps | Most active weekday, historical activity patterns, lifetime statistics |
| Sleep | Sleep history and trend analysis |
| Heart rate | Resting HR trends, long-term cardiovascular metrics |
| Readiness | HRV/SpO2/stress only after stable ingest exists |
| Recovery-Aware Analytics Layer | P2 planned; interpret ATL/CTL/TSB with sleep, HR, steps, energy balance and body trend without mutating raw training load |
| Metric Explainability & Transparency | P2 planned; "Why?" explanations, contributor breakdowns, positive/negative drivers and trend rationale for advanced metrics |

### Recovery-Aware Analytics Layer

Priority: **P2 / Future Enhancement**. Status: **Planned / Not Started**.

Add a recovery-aware interpretation layer that uses sleep, resting heart rate, night heart rate, HRV when available, steps, body weight trend and calorie balance to improve interpretation of training load. This layer must not mutate raw ATL / CTL / TSB values directly. It should calculate derived values and warnings such as Recovery Score, Recovery Modifier, Adjusted ATL, Readiness Score, Fatigue Risk, Overreaching Warning, Recovery Trend and Energy Availability Warning.

Implementation should wait until Health Connect and historical Xiaomi import data are validated.

### Metric Explainability & Transparency

Priority: **P2 / Future Enhancement**. Status: **Planned / Not Started**.

Add an analytics transparency layer so advanced metrics explain what they mean, what inputs contributed, which time period was used, why the current value is high/low and which factors drove warnings or score changes. This should apply to ATL, CTL, TSB and planned recovery-aware metrics.

---

## Desktop Stabilization / Cleanup

Desktop is largely feature-complete compared to mobile. Keep work narrow:

- Fix P0/P1 regressions.
- Preserve import/warmup/backup stability.
- Run packaged installer smoke before release use.
- Add Playwright/E2E only for critical paths when stabilization allows.
- Consider `electron-updater` later; manual reinstall remains current.
- Code cleanup after P0/P1 bugs, HC validation and sync validation.

---

## Уже сделано (2026-05 — 2026-06)

- Dashboard v2, settings hub, HC hub, FormaSync v1
- Wide desktop layout + responsive regression pass (body, food, home, analytics)
- `analytics_query` guards; platform boundaries; orphan UI removal
- Desktop v1 cleanup: `check:desktop-build`, import diagnostics
- Body hub restructure (overview / metrics / weight / steps / sleep / pulse / activity / HC)
- Browser DB import staging (`admin_browser`); dev mini-database export
- Yandex data scope fixes; workout/training UI regressions
- Body history: collapsible summary row + full sections on expand; chart full width
- Strength blocks: supersets/circuits in regular workouts, template structure persistence, history ordering/dedup, prefill from latest actual values including warmup
- Exercise catalog hygiene: edit/delete/archive catalog rows, quick remove from a set
- Nutrition docs restored as active RC source of truth; meal plans v070 in `workouts.db`
- Adaptive calorie calibration foundation: observed vs predicted deficit, history table, raw calorie preservation
- Polar HR sample parser: content-based HR detection, `sample-type: 0`, unknown HR-like samples

Архив планов: [archive/](./archive/).
