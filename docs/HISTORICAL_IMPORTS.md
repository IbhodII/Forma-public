# HISTORICAL_IMPORTS.md

План исторических импортов Forma. Статус: **planned**, priority **P1**. См. также [ROADMAP.md](./ROADMAP.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [ANALYTICS.md](./ANALYTICS.md), [HEALTH_CONNECT.md](./HEALTH_CONNECT.md).

Last updated: **2026-06-05**.

---

## Purpose

Historical import restores data that predates current Forma records. Initial target: Xiaomi ecosystem exports.

Expected sources:

- Mi Fitness;
- Zepp Life;
- historical Xiaomi exports.

This is separate from live Health Connect ingestion. HC reads current phone-provider data; historical import reads exported archives and merges them into Forma.

---

## Initial Data Scope

Required:

- Activity: daily steps, running workouts.
- Health: sleep history, continuous heart rate history.
- Body composition before `2023-08-05`: weight, body fat %, muscle mass.

Optional later:

- stress;
- SpO2;
- proprietary wellness metrics.

---

## Import Rules

- Merge with existing records.
- Avoid duplicates by date/time/source/natural keys.
- Never blindly overwrite existing Forma data.
- Preserve raw imported values where possible.
- Store corrected values separately or mark them clearly.
- Log correction decisions and make them reversible.

Existing Forma monthly step totals for the known duplication period are considered authoritative.

---

## Xiaomi Step Duplication Correction

Status: **planned**. Approximate affected range: **September 2023 – December 2023**.

Problem: historical Xiaomi daily steps can contain duplicated records. Forma already has monthly totals considered more trustworthy.

Algorithm:

```text
Import daily Xiaomi steps.

For each affected month:
  xiaomi_month_total = sum(imported_daily_steps)
  forma_month_total = existing trusted Forma monthly total

  if xiaomi_month_total > forma_month_total:
      excess_steps = xiaomi_month_total - forma_month_total
      daily_correction = excess_steps / days_with_records
      corrected_daily_steps = max(0, imported_daily_steps - daily_correction)
  else:
      corrected_daily_steps = imported_daily_steps
```

Goals:

- preserve realistic daily trends;
- preserve trusted monthly totals;
- reconstruct historical daily data;
- keep raw values available for audit.

Requirements:

- raw imported steps are preserved;
- corrected steps are identifiable;
- correction is logged with month, source totals, excess, daily correction and affected days;
- correction is reversible.

---

## Architecture Notes

Historical import should use a staging layer before writing production tables:

1. Parse source export into normalized staging rows.
2. Compute natural keys and duplicate candidates.
3. Apply source-specific corrections such as Xiaomi monthly step normalization.
4. Produce an import report with inserted/skipped/corrected rows.
5. Commit only after user confirmation or explicit import mode.

Do not mix historical import with live Health Connect sync. After import, corrected day-level values may participate in analytics and FormaSync only with clear source/correction metadata.

---

## Open Decisions

- Final schema for raw vs corrected historical step values.
- Whether historical HR should be stored as raw sample rows or day aggregates first.
- How body composition source priority should interact with manual measurements.
- Whether monthly trusted totals should be editable before applying correction.
