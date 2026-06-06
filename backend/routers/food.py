# -*- coding: utf-8 -*-
"""API дневника питания."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.models import (
    ApplyMealPlanRangeRequest,
    ApplyMealPlanRequest,
    ApplyMealPlanResponse,
    ApplyTemplateRequest,
    ApplyTemplateResponse,
    FoodClearDayResponse,
    FoodCompositeCreate,
    FoodCompositeUpdate,
    FoodDayResponse,
    FoodEntry,
    FoodEntryCreate,
    FoodEntryUpdate,
    FoodProduct,
    FoodProductCreate,
    FoodProductDetail,
    FoodProductUpdate,
    OpenFoodFactsBarcodeResponse,
    OpenFoodFactsContributeBody,
    OpenFoodFactsContributeResponse,
    OpenFoodFactsSearchResponse,
    FoodWeekResponse,
    MealPlanCreate,
    MealPlanDetail,
    MealPlanSummary,
    MealPlanUpdate,
    MealTemplateDetail,
    MealTemplateUpdate,
    WeeklyScheduleItem,
    WeeklyScheduleSave,
    MealTemplateSummary,
    MicroGoalsResponse,
    MicroGoalsSave,
    MicrosDayResponse,
    MicrosWeekResponse,
    NutritionGoals,
    NutritionGoalsSave,
)
from backend.services import food_service, micro_nutrients_service, openfoodfacts_lookup
from backend.services.openfoodfacts_contribute import (
    contribute_product,
    off_contribute_configured,
)
from utils.date_guard import parse_workout_date

router = APIRouter(tags=["food"])


def _parse_phase(phase: str) -> str:
    p = phase.strip().lower()
    if p not in food_service.FOOD_PHASES:
        raise HTTPException(status_code=400, detail="phase: cut или bulk")
    return p


@router.get(
    "/openfoodfacts/by-barcode",
    response_model=OpenFoodFactsBarcodeResponse,
    summary="Поиск продукта по штрихкоду (локально → Open Food Facts)",
)
def api_off_by_barcode(barcode: str = Query(..., min_length=8, max_length=20)):
    return OpenFoodFactsBarcodeResponse(**openfoodfacts_lookup.lookup_by_barcode(barcode))


@router.get(
    "/openfoodfacts/search",
    response_model=OpenFoodFactsSearchResponse,
    summary="Поиск продуктов по названию (Open Food Facts)",
)
def api_off_search(query: str = Query(..., min_length=2, max_length=120)):
    return OpenFoodFactsSearchResponse(**openfoodfacts_lookup.lookup_by_name(query))


@router.post(
    "/openfoodfacts/contribute",
    response_model=OpenFoodFactsContributeResponse,
    summary="Отправить продукт в Open Food Facts",
    description=(
        "Создание карточки продукта в общей базе OFF. "
        "На сервере нужны OFF_USER_ID и OFF_PASSWORD в .env."
    ),
)
def api_off_contribute(body: OpenFoodFactsContributeBody):
    result = contribute_product(
        barcode=body.barcode,
        name=body.name,
        brand=body.brand,
        protein=body.protein,
        fat=body.fat,
        carbs=body.carbs,
        fiber_g=body.fiber_g,
        calories=body.calories,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "OFF error")
    return OpenFoodFactsContributeResponse(**result)


@router.get(
    "/openfoodfacts/contribute/status",
    summary="Настроена ли отправка в Open Food Facts",
)
def api_off_contribute_status():
    return {"configured": off_contribute_configured()}


@router.get("/products", response_model=list[FoodProduct], summary="Справочник продуктов")
def api_list_products(
    phase: str | None = Query(None, description="Устарело: справочник общий для cut/bulk"),
    q: str | None = Query(None, description="Поиск по названию"),
):
    del phase
    return [FoodProduct(**p) for p in food_service.list_products(q)]


@router.get(
    "/products/{product_id}",
    response_model=FoodProductDetail,
    summary="Продукт по id",
)
def api_get_product(
    product_id: int,
    include_components: bool = Query(
        False,
        description="Для составных блюд — вернуть список компонентов",
    ),
):
    return FoodProductDetail(
        **food_service.get_product_by_id(product_id, include_components=include_components)
    )


@router.post("/products", response_model=FoodProduct, summary="Создать простой продукт")
def api_create_product(
    body: FoodProductCreate,
    phase: str | None = Query(None, description="Устарело"),
):
    del phase
    return FoodProduct(**food_service.create_product(body.model_dump()))


@router.put(
    "/products/{product_id}",
    response_model=FoodProduct,
    summary="Обновить простой продукт",
)
def api_update_product(product_id: int, body: FoodProductUpdate):
    return FoodProduct(
        **food_service.update_product(
            product_id, body.model_dump(exclude_unset=True)
        )
    )


@router.post("/composite", response_model=FoodProduct, summary="Создать многосоставное блюдо")
def api_create_composite(body: FoodCompositeCreate):
    return FoodProduct(
        **food_service.create_composite_product(body.model_dump())
    )


@router.put(
    "/composite/{product_id}",
    response_model=FoodProduct,
    summary="Обновить составное блюдо",
)
def api_update_composite(product_id: int, body: FoodCompositeUpdate):
    return FoodProduct(
        **food_service.update_composite_product(
            product_id, body.model_dump(exclude_unset=True)
        )
    )


@router.get("/templates", response_model=list[MealTemplateSummary], summary="Шаблоны приёмов")
def api_list_templates(phase: str = Query("cut", description="cut | bulk")):
    ph = _parse_phase(phase)
    return [MealTemplateSummary(**t) for t in food_service.list_templates(ph)]


@router.get(
    "/templates/{template_id}",
    response_model=MealTemplateDetail,
    summary="Детали шаблона",
)
def api_get_template(template_id: int):
    return MealTemplateDetail(**food_service.get_template(template_id))


@router.put(
    "/templates/{template_id}",
    response_model=MealTemplateDetail,
    summary="Обновить шаблон приёма пищи",
)
def api_update_template(template_id: int, body: MealTemplateUpdate):
    return MealTemplateDetail(
        **food_service.update_template(template_id, body.model_dump(exclude_unset=True))
    )


@router.post(
    "/entries/from_template",
    response_model=ApplyTemplateResponse,
    summary="Добавить продукты из шаблона в дневник",
)
def api_apply_template(body: ApplyTemplateRequest):
    result = food_service.apply_template(
        body.template_id,
        body.date,
        body.phase,
        body.meal_type,
    )
    return ApplyTemplateResponse(**result)


@router.get("/plans", response_model=list[MealPlanSummary], summary="Дневные рационы")
@router.get(
    "/meal-plans",
    response_model=list[MealPlanSummary],
    summary="Дневные рационы (алиас)",
    include_in_schema=True,
)
def api_list_meal_plans(
    phase: str | None = Query(None, description="cut | bulk; без параметра — все"),
    include_custom: bool = Query(True, description="Включать пользовательские рационы"),
):
    ph = _parse_phase(phase) if phase is not None else None
    return [
        MealPlanSummary(**p)
        for p in food_service.list_meal_plans(ph, include_custom=include_custom)
    ]


@router.post("/meal-plans", response_model=MealPlanDetail, summary="Создать рацион")
def api_create_meal_plan(body: MealPlanCreate):
    return MealPlanDetail(**food_service.create_meal_plan(body.model_dump()))


@router.put("/meal-plans/{plan_id}", response_model=MealPlanDetail, summary="Обновить рацион")
def api_update_meal_plan(plan_id: int, body: MealPlanUpdate):
    return MealPlanDetail(
        **food_service.update_meal_plan(plan_id, body.model_dump(exclude_unset=True))
    )


@router.delete("/meal-plans/{plan_id}", summary="Удалить пользовательский рацион")
def api_delete_meal_plan(plan_id: int):
    return food_service.delete_meal_plan(plan_id)


@router.get(
    "/plans/{plan_id}",
    response_model=MealPlanDetail,
    summary="Состав рациона",
)
@router.get(
    "/meal-plans/{plan_id}",
    response_model=MealPlanDetail,
    summary="Состав рациона (алиас)",
    include_in_schema=True,
)
def api_get_meal_plan(plan_id: int):
    return MealPlanDetail(**food_service.get_meal_plan(plan_id))


@router.post(
    "/meal-plans/{plan_id}/apply",
    response_model=ApplyMealPlanResponse,
    summary="Применить рацион к дате или диапазону",
)
def api_apply_meal_plan_by_id(plan_id: int, body: ApplyMealPlanRangeRequest):
    result = food_service.apply_meal_plan_range(
        plan_id,
        body.start_date,
        body.end_date,
        body.phase,
        overwrite=body.overwrite,
    )
    return ApplyMealPlanResponse(**result)


@router.get(
    "/weekly-schedule",
    response_model=list[WeeklyScheduleItem],
    summary="Расписание рационов по дням недели",
)
def api_get_weekly_schedule():
    return [WeeklyScheduleItem(**d) for d in food_service.get_weekly_meal_schedule()]


@router.post(
    "/weekly-schedule",
    response_model=list[WeeklyScheduleItem],
    summary="Сохранить расписание рационов",
)
def api_save_weekly_schedule(body: WeeklyScheduleSave):
    payload = [d.model_dump() for d in body.days]
    return [
        WeeklyScheduleItem(**d)
        for d in food_service.save_weekly_meal_schedule(payload)
    ]


@router.post(
    "/entries/from_plan",
    response_model=ApplyMealPlanResponse,
    summary="Добавить приёмы из рациона (день или неделя)",
)
@router.post(
    "/apply-meal-plan",
    response_model=ApplyMealPlanResponse,
    summary="Применить рацион (алиас)",
    include_in_schema=True,
)
def api_apply_meal_plan(body: ApplyMealPlanRequest):
    parsed = parse_workout_date(body.date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    d = parsed.isoformat()
    if body.apply_week:
        result = food_service.apply_meal_plan_week(
            body.plan_id,
            d,
            body.phase,
            replace_existing=body.replace_existing,
        )
    else:
        result = food_service.apply_meal_plan(
            body.plan_id,
            d,
            body.phase,
            replace_existing=body.replace_existing,
        )
        result["apply_week"] = False
    return ApplyMealPlanResponse(**result)


@router.get("/entries/week", response_model=FoodWeekResponse, summary="Дневник за неделю")
def api_get_week_entries(
    date: str = Query(..., description="Любая дата недели (YYYY-MM-DD)"),
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    return FoodWeekResponse(**food_service.get_week_log(parsed.isoformat(), ph))


@router.get("/entries", response_model=FoodDayResponse, summary="Дневник за дату")
def api_get_entries(
    date: str = Query(..., description="YYYY-MM-DD"),
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    return FoodDayResponse(**food_service.get_day_log(parsed.isoformat(), ph))


@router.delete(
    "/entries",
    response_model=FoodClearDayResponse,
    summary="Удалить все записи за день",
)
def api_clear_day_entries(
    date: str = Query(..., description="YYYY-MM-DD"),
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    d = parsed.isoformat()
    deleted = food_service.clear_day_entries(d, ph)
    return FoodClearDayResponse(
        deleted=deleted,
        date=d,
        phase=ph,
        message="ok" if deleted else "Записей не было",
    )


@router.post("/entries", response_model=FoodEntry, summary="Добавить запись")
def api_add_entry(body: FoodEntryCreate):
    return FoodEntry(**food_service.add_entry(body.model_dump()))


@router.put("/entries/{entry_id}", response_model=FoodEntry, summary="Изменить запись")
def api_update_entry(entry_id: int, body: FoodEntryUpdate):
    return FoodEntry(
        **food_service.update_entry(entry_id, body.model_dump(exclude_unset=True))
    )


@router.delete("/entries/{entry_id}", summary="Удалить запись")
def api_delete_entry(entry_id: int):
    food_service.delete_entry(entry_id)
    return {"message": "ok"}


@router.get("/goals/{date}", response_model=NutritionGoals | None, summary="Нормы на день")
def api_get_goals(
    date: str,
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    goals = food_service.get_goals(parsed.isoformat(), ph)
    return NutritionGoals(**goals) if goals else None


@router.post("/goals/{date}", response_model=NutritionGoals, summary="Сохранить нормы")
def api_save_goals(
    date: str,
    body: NutritionGoalsSave,
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    saved = food_service.save_goals(parsed.isoformat(), ph, body.model_dump())
    return NutritionGoals(**saved)


@router.get(
    "/micros/day/{date}",
    response_model=MicrosDayResponse,
    summary="Микронутриенты за день",
)
def api_micros_day(
    date: str,
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    return MicrosDayResponse(**micro_nutrients_service.get_micros_day(parsed.isoformat(), ph))


@router.get(
    "/micros/week/{date}",
    response_model=MicrosWeekResponse,
    summary="Микронутриенты за неделю",
)
def api_micros_week(
    date: str,
    phase: str = Query("cut", description="cut | bulk"),
):
    parsed = parse_workout_date(date)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Некорректная дата")
    ph = _parse_phase(phase)
    return MicrosWeekResponse(**micro_nutrients_service.get_micros_week(parsed.isoformat(), ph))


@router.get(
    "/micros/goals",
    response_model=MicroGoalsResponse,
    summary="Суточные нормы микронутриентов",
)
def api_micros_goals():
    return MicroGoalsResponse(**micro_nutrients_service.get_micro_goals())


@router.put(
    "/micros/goals",
    response_model=MicroGoalsResponse,
    summary="Сохранить суточные нормы микронутриентов",
)
def api_save_micros_goals(body: MicroGoalsSave):
    return MicroGoalsResponse(**micro_nutrients_service.save_micro_goals(body.goals))
