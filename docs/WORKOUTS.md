# WORKOUTS.md

Desktop RC source of truth for workouts, strength templates, supersets, circuits, workout history, Polar attach, and the exercise catalog.

Last updated: **2026-06-05**.

---

## Scope

| Area | Current behavior |
|------|------------------|
| Strength workouts | Regular strength sessions with ordered sets, warmup sets, bodyweight/duration sets, and history prefill |
| Blocks | A workout is represented as ordered blocks: `normal`, `superset`, `circuit` |
| Templates | Exercise sets preserve block structure in `exercise_set_items`; templates define composition/order/structure, not working weights |
| Prefill | New workout values come from the latest actual performance first; template values are fallback only |
| History | Normal exercises are grouped compactly; supersets/circuits render once, in execution order |
| Exercise catalog | `all_exercises` can be edited; used rows are archived on delete, not removed from history |

---

## Strength Block Model

The form model is `WorkoutBlock[]` in `frontend/src/components/strength/workoutApproaches.ts`.

| Block type | Meaning |
|------------|---------|
| `normal` | One exercise with warmup + working sets |
| `superset` | Two or more exercises performed back-to-back for N rounds |
| `circuit` | Several exercises performed round-by-round for N rounds |

Persisted metadata on `strength_workouts` (v071):

- `block_uid`
- `block_type`
- `block_order`
- `block_rounds`
- `block_exercise_order`
- `round_index`
- `block_title`

The saved table remains flat for analytics compatibility. The metadata reconstructs structure for edit/history UI.

---

## Creating A Workout

`WorkoutFormModal` loads `GET /api/strength/workout-form-prefill` and builds blocks via `blocksFromPrefill`.

Rules:

1. Template/preset defines which exercises appear and where they are placed.
2. Latest actual history wins for:
   - working weight;
   - reps;
   - number of working sets;
   - warmup set count/weight/reps/order.
3. Template target values are fallback only when exercise history is absent.
4. This applies to normal exercises and exercises inside supersets/circuits.

In the workout modal:

- Simple view is the default.
- Normal exercises render as editable exercise cards.
- Supersets/circuits render as compact cards that can be expanded inline to edit workout data.
- `Редактировать структуру` switches to structure mode and is only for changing block organization.

Inline expanded supersets/circuits allow editing current-session data:

- weight;
- reps;
- warmup sets;
- working sets;
- duplicate/remove set rows.

They do **not** change template structure: exercise composition/order and block type/rounds remain structural edits.

---

## Exercise Sets / Templates

The "Набор упражнений" editor uses `WorkoutBlocksEditor` with:

- simple list as default;
- compact structure mode (`structureVariant="layout"`);
- no working weight/reps fields in template structure mode.

`exercise_set_items` persists structure metadata (v072):

- block fields (`block_uid`, `block_type`, `block_order`, `block_rounds`, `block_exercise_order`, `block_title`);
- optional target fields (`target_reps`, `target_weight`, `target_duration_sec`, `is_bodyweight`, `is_warmup`) retained for fallback/backward compatibility.

Current product rule: templates are the source of **composition, order, and structure**. They are not the primary source of working values.

Open P1 issue: creating a new exercise template/set can lose block organization. Expected behavior is to preserve block order, block names, exercise assignments and generated workout structure. Until fixed, users may need to repair affected templates in Block Structure editor. See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) and [ROADMAP.md](./ROADMAP.md).

---

## History

History display uses a unified timeline from `sessionTimelineItemsFromDetail`.

Behavior:

- normal sets are grouped by exercise and compacted as `7+7+7`;
- superset/circuit exercises are not duplicated as standalone rows;
- structural blocks are sorted by actual `order_index`/block metadata, not forced to the end;
- legacy sessions without block metadata still render through fallback grouping.

---

## Polar Flow

Polar pending workouts are surfaced on `/workouts`.

| Flow | Behavior |
|------|----------|
| Cardio attach | Fills HR/calories when target rows have empty fields; FIT/Polar ownership remains protected |
| Strength attach | Updates `avg_hr` and `calories_chest` across all rows in the strength session when Polar provides values |
| Pending queue | Attach, create workout, or delete pending upload from the UI |

### Polar HR samples

Polar AccessLink can return full HR time-series data, not only `avg_hr` / `max_hr`.
Confirmed real payload:

```json
{
  "heart-rate": {
    "average": 93,
    "maximum": 117
  },
  "samples": [
    {
      "sample-type": 0,
      "recording-rate": 1,
      "data": "84,85,86,86,87..."
    }
  ]
}
```

Current parsing rule: analyze sample content first, then use `sample-type` as a hint, not as the only source of truth.

- Known HR sample types remain supported: `sample-type: 1`, `HEART_RATE`, `HEART RATE`.
- `sample-type: 0` is treated as HR when the block has HR-like CSV data and the payload contains `heart-rate` metadata.
- Unknown `sample-type` is not silently discarded: if `samples[].data` is CSV-like, most values are plausible HR (`25-240 bpm`), and `heart-rate.average` / `heart-rate.maximum` exists, the block is parsed as HR.
- Invalid values are filtered: empty values, `null`, zero, negative values, and impossible HR values.
- `recording-rate` controls time offset: `elapsed_sec = index * recording_rate`; missing/invalid rate falls back to `1` and is logged.
- Unrecognized sample blocks are logged with `sample-type`, `recording-rate`, value count, and preview.

Parsed points are saved to `workout_heart_rate` during attach (`source_type='cardio'` or `source_type='strength'`) and feed the heart-rate chart and strength HR analytics.

Polar/FIT ingestion remains desktop/backend scope. Mobile standalone completion does not currently include Polar import parity.

---

## Exercise Catalog Hygiene

Catalog table: `all_exercises`.

Current behavior:

- `GET /api/strength/exercises` returns active names for autocomplete/search.
- `GET /api/strength/exercises/catalog` returns editable catalog rows.
- `PUT /api/strength/exercises/{id}` updates the catalog row only; it does not rewrite workout history.
- `DELETE /api/strength/exercises/{id}` physically deletes unused rows; used rows are archived (`is_archived=1`) so history remains intact.
- Empty or broken names display as `Без названия` in management UI.

Deleting an exercise from a specific template set is separate from catalog deletion: it removes the row from the current `WorkoutBlock[]` and is saved with the exercise set.

---

## Analytics Boundary

Strength HR analytics reads saved session rows and block metadata. It does not depend on template target values.

CTL/ATL/TSB still use cardio TRIMP only. Strength volume, 1RM, and HR-in-strength remain separate analytics surfaces.
