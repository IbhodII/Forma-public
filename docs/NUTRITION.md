# NUTRITION.md

Desktop RC source of truth for food diary, products, composite dishes, meal plans, nutrition targets, forecast, and food-related backup/import boundaries.

Last updated: **2026-06-09**.

---

## Scope

| Area | Current behavior |
|------|------------------|
| Food diary | `/food`, weekly-first layout with day drawer |
| Products | Shared catalog in `food_products`; product CRUD from food UI |
| Composite dishes | Created from component products and saved as catalog products |
| Meal plans | Stored only in `workouts.db` (v070 move, v079 finalize + shared purge) |
| Nutrition goals | Per-user targets and g/kg settings in profile |
| Forecast | Cut/bulk forecast and deficit control in desktop UI |
| Mobile | Local-first food is partial; desktop is current reference for advanced forecast UI |

---

## Food Diary UI

Route: `/food`.

Current desktop behavior:

- phase selector: `cut` / `bulk`;
- week navigation and 7-day grid;
- today's card uses a black border in light theme;
- day drawer handles meal CRUD, product add/edit, bracelet calories, and day totals;
- weekly deficit/gain panels are shown for the active phase;
- future dates are allowed when applying meal plans.

Legacy `/cut-bulk` routes redirect to `/food`.

---

## Products And Composite Dishes

Main catalog: `food_products` in `shared.db`.

Important fields:

- macros per 100 g;
- `fiber_g`;
- `default_portion_g`;
- micronutrients;
- `is_composite`;
- `unit`.

Composite products:

1. User chooses component products and quantities.
2. Backend calculates total macros and per-100 g values.
3. The result is saved as a product with `is_composite=1`.
4. Component rows are stored in `food_product_components`.

Open Food Facts barcode search remains an enrichment path, not the source of truth.

---

## Meal Plans

Meal plan tables live in **`workouts.db` only** (canonical after v079):

- `meal_templates`;
- `meal_template_items`;
- `daily_meal_plans`;
- `daily_meal_plan_templates`;
- `meal_plan_items`.

Migration **v079** reconciles any legacy shared rows into main, then **drops** meal tables from `shared.db` (`shared_meal_plans_purged_v1`).  
Routing: `database/meal_plans_storage.py` (`meal_plan_schema()`). Import of old DBs still supported via reconcile + migrations.

Weekly schedule:

- `weekly_meal_schedule` maps `day_of_week` to plan;
- apply can clear existing day entries before adding plan entries;
- `day_offset` respects the user's week start.

---

## Nutrition Goals And Forecast

Per-user settings live in `user_profile`:

- `protein_gram_per_kg`;
- `fat_gram_per_kg`;
- `carbs_gram_per_kg`;
- `activity_level`;
- `max_deficit_per_kg_fat`;
- `max_physiological_deficit_per_kg_fat`;
- `micro_goals_json`.

Goal deficit validation:

- Intended supported upper limit: **70 kcal/kg fat**.
- Deficit limit: configurable **5–70 kcal/kg fat** (`max_deficit_per_kg_fat` in profile); physiological ceiling 70 kcal/kg fat.
- Fix investigation should check frontend validation limits, backend validation limits, API schema constraints and settings persistence logic.
- Values above 70 should be rejected with a user-friendly validation message.

Forecast behavior:

- readiness scans up to 8 weeks back;
- dynamic cut forecast returns HTTP 200 even for dangerous deficit;
- dangerous deficit is capped in the model and shown as a red warning in UI;
- weekly expenditure and bracelet calories are used as inputs where available.

CTL/fitness analytics do not rewrite food diary data.

## Adaptive calorie calibration

Bracelet/device calories are stored raw. The daily expenditure model first preserves the workout source priority rule:

```
raw activity = bracelet daily calories - bracelet workout calories + Polar/chest effective workout calories
```

Then `calibration_factor` is applied to this final activity component, not to `bracelet_total` before workout replacement. This avoids double-counting Polar/chest calories.

Recalculation uses a rolling window (default 14 days) and compares:

```
predicted deficit = predicted expenditure - consumed calories
observed deficit = -trend_weight_change_kg * 7700
factor = observed deficit / predicted deficit
```

Quality gates: at least 14 days, at least 5 weigh-ins, sufficient food days and sufficient bracelet-calorie coverage. Schema v074 stores aggregate window results in `calorie_calibration_history`; raw imported calories are never overwritten.

Current state: manual recalculation / adaptive foundation exists. Planned: automatic recalibration every 14 days, with user-visible last calibration date, factor, confidence and window length. This must update only correction coefficients and calibration logs.

---

## Backup / Restore / Import

Food data participates in:

- desktop ZIP backup/restore (`workouts.db` + `shared.db`);
- database import merge/replace with user remap;
- FormaSync entities for mobile/cloud where supported.

Rules:

- `food_entries` are user-scoped;
- product catalog is shared/catalog-like and merged by natural keys;
- meal plans are user-scoped in `workouts.db`;
- import must not blindly replace catalog ids.

---

## Current Limitations

- Advanced forecast UI is desktop-first.
- Mobile nutrition is active roadmap work: daily calorie tracking, OpenFoodFacts and food logging are required for the standalone mobile target.
- Open Food Facts data can be noisy and should be manually corrected.
- Product catalog cleanup remains manual through the food/product UI.
