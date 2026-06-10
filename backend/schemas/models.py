# -*- coding: utf-8 -*-
"""
Pydantic-модели запросов и ответов Health Dashboard API.

Даты в API передаются строками YYYY-MM-DD (поле date: str).
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from utils.constants import CARDIO_ARCHIVE_TYPE, CARDIO_DB_BIKE
from utils.date_guard import is_future_workout_date, parse_workout_date

ALLOWED_CARDIO_TYPES = frozenset(
    {CARDIO_DB_BIKE, CARDIO_ARCHIVE_TYPE, "бассейн"}
)


def _normalize_api_date(value: str) -> str:
    """YYYY-MM-DD; ошибка, если дата невалидна или в будущем."""
    parsed = parse_workout_date(value)
    if parsed is None:
        raise ValueError("Некорректная дата, ожидается YYYY-MM-DD")
    if is_future_workout_date(parsed):
        raise ValueError("Дата не может быть в будущем")
    return parsed.isoformat()


def _normalize_food_date(value: str) -> str:
    """YYYY-MM-DD для дневника питания (будущие даты допустимы — планирование рациона)."""
    parsed = parse_workout_date(value)
    if parsed is None:
        raise ValueError("Некорректная дата, ожидается YYYY-MM-DD")
    return parsed.isoformat()


# ---------------------------------------------------------------------------
# Силовые тренировки
# ---------------------------------------------------------------------------


class StrengthSession(BaseModel):
    """Краткая сводка силовой сессии (группа по дате и названию)."""

    date: str  # YYYY-MM-DD
    workout_title: str
    avg_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    sets_count: int
    volume_kg: Optional[float] = None
    has_hr: bool = False
    duration_sec: Optional[int] = None


class StrengthSessionDetail(BaseModel):
    """Детали силовой сессии: упражнения, пульс, калории."""

    date: str
    workout_title: str
    # Каждый элемент: {"exercise": str, "weight": float, "reps_str": str}
    exercises: list[dict[str, Any]]
    avg_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    has_hr: bool = False
    hr_workout_id: Optional[int] = Field(
        None,
        description="id строки strength_workouts для GET /strength/{id}/heart-rate",
    )
    anchor_row_id: Optional[int] = Field(
        None,
        description="id первой строки сессии (fallback для пульса)",
    )
    duration_sec: Optional[int] = None
    ordered_sets: list[dict[str, Any]] = Field(default_factory=list)
    uses_ordered_sets: bool = False
    is_circuit: bool = Field(
        False,
        description="Круговая тренировка: подходы в порядке выполнения, без группировки",
    )


class StrengthHrMatchedSet(BaseModel):
    exercise: str = ""
    set_number: int = 0
    weight: float = 0
    reps_str: str = ""
    load_display: str = ""
    is_warmup: bool = False


class StrengthHrBlockDebug(BaseModel):
    raw_peaks_count: int = 0
    raw_blocks_count: int = 0
    merged_blocks_count: int = 0
    expected_set_count: Optional[int] = None
    merge_reasons: list[str] = Field(default_factory=list)
    adaptive_passes_used: int = 0


class StrengthHrDetectedBlock(BaseModel):
    """Авто-блок, выделенный по пику пульса."""

    block_index: int
    block_id: Optional[int] = None
    start_sec: int
    end_sec: int
    duration_sec: Optional[int] = None
    peak_hr: Optional[int] = None
    avg_hr: Optional[int] = None
    min_hr: Optional[int] = None
    hr_rise: Optional[int] = None
    recovery_drop: Optional[int] = None
    recovery_time: Optional[int] = None
    confidence: str = "medium"
    confidence_reason: Optional[str] = None
    matched_order_index: Optional[int] = None
    matched_exercise: Optional[str] = None
    matched_set_number: Optional[int] = None
    matched_load_display: Optional[str] = None
    is_warmup: bool = False
    matched_set: Optional[StrengthHrMatchedSet] = None
    kind: Optional[str] = Field(None, description="set | rest | noise (manual override)")


class StrengthHrBlockOverrideItem(BaseModel):
    block_index: int = Field(..., ge=1)
    start_sec: int = Field(..., ge=0)
    end_sec: int = Field(..., ge=1)
    kind: str = Field("set", description="set | rest | noise")
    assigned_order_index: Optional[int] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    source_auto_block_index: Optional[int] = Field(
        None, description="Auto block index before manual edit (future ML signal)"
    )
    original_start_sec: Optional[int] = Field(
        None, description="Original auto start_sec before manual edit"
    )
    original_end_sec: Optional[int] = Field(
        None, description="Original auto end_sec before manual edit"
    )


class StrengthHrBlockOverridesResponse(BaseModel):
    date: str
    workout_title: str
    blocks: list[StrengthHrBlockOverrideItem] = Field(default_factory=list)


class StrengthHrBlockOverridesPutBody(BaseModel):
    blocks: list[StrengthHrBlockOverrideItem] = Field(default_factory=list)


class StrengthHrSetMetrics(BaseModel):
    order_index: int = 0
    set_number: int = 0
    exercise: str = ""
    weight: float = 0
    reps_str: str = ""
    load_display: str = ""
    is_warmup: bool = False
    start_sec: int = 0
    end_sec: int = 0
    peak_hr: Optional[int] = None
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    min_hr: Optional[int] = None
    hr_rise: Optional[int] = None
    zone_seconds: Optional[dict[str, float]] = None
    strain_score: Optional[float] = None
    recovery_drop: Optional[int] = None
    recovery_time: Optional[int] = None
    recovery_delta_bpm: Optional[int] = None
    confidence: str = "medium"


class StrengthHrExerciseMetrics(BaseModel):
    exercise: str
    sets_count: int
    avg_peak_hr: Optional[int] = None
    highest_hr_set: Optional[dict[str, Any]] = None
    avg_recovery_delta: Optional[int] = None
    cardiovascular_load_estimate: Optional[float] = None


class StrengthHrComparisonItem(BaseModel):
    exercise: str
    current_peak_hr: Optional[int] = None
    previous_peak_hr: Optional[int] = None
    delta_bpm: Optional[int] = None
    prior_sessions_count: int = 0


class StrengthHrAnalysisResponse(BaseModel):
    date: str
    workout_title: str
    confidence: Optional[str] = None
    confidence_reason: Optional[str] = None
    confidence_reasons: list[str] = Field(default_factory=list)
    disclaimer: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    duration_sec: Optional[int] = None
    detection_mode: str = "peak"
    match_quality: str = "blocks_only"
    detected_count: int = 0
    expected_count: Optional[int] = None
    hr_available: bool = False
    hr_samples_count: int = 0
    ordered_sets_count: int = 0
    detected_blocks_count: int = 0
    thresholds_used: Optional[dict[str, int]] = None
    debug: Optional[StrengthHrBlockDebug] = None
    detected_blocks: list[StrengthHrDetectedBlock] = Field(default_factory=list)
    sets: list[StrengthHrSetMetrics] = Field(default_factory=list)
    exercises: list[StrengthHrExerciseMetrics] = Field(default_factory=list)
    comparison: list[StrengthHrComparisonItem] = Field(default_factory=list)
    comparison_available: bool = False
    overrides_applied: bool = False
    auto_detected_blocks: Optional[list[StrengthHrDetectedBlock]] = None
    manual_blocks: Optional[list[StrengthHrDetectedBlock]] = Field(
        None,
        description="Alias for detected_blocks when overrides_applied is true",
    )
    mapping_status: str = "auto"
    has_verified_mapping: bool = False
    has_manual_mapping: bool = False


class StrengthHrSessionSummary(BaseModel):
    date: str
    workout_title: str
    duration_sec: Optional[int] = None
    detected_blocks_count: int = 0
    verified_blocks_count: int = 0
    avg_peak_hr: Optional[int] = None
    max_hr: Optional[int] = None
    avg_recovery_drop: Optional[int] = None
    avg_recovery_time: Optional[int] = None
    high_intensity_blocks: int = 0
    confidence: Optional[str] = None
    mapping_status: str = "auto"
    has_verified_mapping: bool = False
    has_manual_mapping: bool = False
    overrides_applied: bool = False


class StrengthHrExerciseAggregate(BaseModel):
    exercise: str
    sessions_count: int = 0
    sets_count: int = 0
    avg_peak_hr: Optional[int] = None
    max_peak_hr: Optional[int] = None
    avg_recovery_drop: Optional[int] = None
    trend_direction: str = "stable"
    recovery_trend_direction: str = "stable"
    latest_vs_previous: Optional[int] = None
    insight: Optional[str] = None


class StrengthHrTrendPoint(BaseModel):
    date: str
    workout_title: str
    avg_peak_hr: Optional[int] = None
    max_hr: Optional[int] = None
    avg_recovery_drop: Optional[int] = None
    block_count: int = 0
    mapping_status: str = "auto"
    confidence: Optional[str] = None


class StrengthHrAnalyticsFilters(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    workout_title: Optional[str] = None
    exercise: Optional[str] = None
    verified_only: bool = False
    min_confidence: Optional[str] = None


class StrengthHrSessionDetailResponse(BaseModel):
    summary: StrengthHrSessionSummary
    analysis: StrengthHrAnalysisResponse
    mappings: list[dict[str, Any]] = Field(default_factory=list)
    meta: Optional[dict[str, Any]] = None


class StrengthHrMappingPutBody(BaseModel):
    blocks: list[dict[str, Any]]
    mapping_status: str = "manual"


class StrengthHrSessionsListResponse(BaseModel):
    items: list[StrengthHrSessionSummary]
    total: int
    limit: int
    offset: int


class StrengthHrExerciseAggregatesResponse(BaseModel):
    items: list[StrengthHrExerciseAggregate]


class StrengthHrTrendsResponse(BaseModel):
    items: list[StrengthHrTrendPoint]


class StrengthHrAnalyticsOverviewResponse(BaseModel):
    sessions: list[StrengthHrSessionSummary]
    sessions_total: int
    sessions_limit: int
    sessions_offset: int
    exercises: list[StrengthHrExerciseAggregate]
    trends: list[StrengthHrTrendPoint]
    truncated: bool = False


class StrengthSetCreate(BaseModel):
    """Один подход в порядке выполнения (POST /api/strength/workout, поле sets)."""

    exercise: str = Field(..., min_length=1)
    weight: Optional[float] = Field(0, ge=0, description="NULL/0 для упражнений на время")
    reps: int = Field(..., gt=0)
    notes: str = ""
    is_warmup: bool = False
    duration_sec: Optional[int] = Field(None, ge=1, description="Для планки и веса тела")
    is_bodyweight: bool = False
    set_number: Optional[int] = Field(
        None,
        description="Необязательно; сервер задаёт глобальный порядок (order_index)",
    )
    block_uid: Optional[str] = Field(None, max_length=64)
    block_type: Optional[Literal["normal", "superset", "circuit"]] = None
    block_order: Optional[int] = Field(None, ge=0)
    block_rounds: Optional[int] = Field(None, ge=1)
    block_exercise_order: Optional[int] = Field(None, ge=0)
    round_index: Optional[int] = Field(None, ge=1)
    block_title: Optional[str] = Field(None, max_length=120)

    @model_validator(mode="after")
    def _bodyweight_duration(self) -> "StrengthSetCreate":
        if self.is_bodyweight and not self.duration_sec:
            raise ValueError("Для упражнения на время укажите duration_sec")
        return self


class StrengthExerciseCreate(BaseModel):
    """Один подход в POST /api/strength/workout (legacy: группировка по exercises)."""

    exercise: str = Field(..., min_length=1)
    weight: Optional[float] = Field(0, ge=0, description="NULL/0 для упражнений на время")
    reps_list: list[int] = Field(..., min_length=1)
    notes: str = ""
    is_warmup: bool = False
    duration_sec: Optional[int] = Field(None, ge=1, description="Для планки и веса тела")
    is_bodyweight: bool = False

    @field_validator("reps_list")
    @classmethod
    def _reps_positive(cls, reps: list[int]) -> list[int]:
        for r in reps:
            if int(r) <= 0:
                raise ValueError("Все повторения в reps_list должны быть > 0")
        return reps

    @model_validator(mode="after")
    def _bodyweight_duration(self) -> "StrengthExerciseCreate":
        if self.is_bodyweight and not self.duration_sec:
            raise ValueError("Для упражнения на время укажите duration_sec")
        return self


class StrengthWorkoutCreate(BaseModel):
    """Тело POST-запроса: новая силовая тренировка."""

    date: str
    workout_title: str = Field(..., min_length=1)
    sets: Optional[list[StrengthSetCreate]] = Field(
        None,
        min_length=1,
        description="Подходы в порядке выполнения (предпочтительный формат)",
    )
    exercises: Optional[list[StrengthExerciseCreate]] = Field(
        None,
        min_length=1,
        description="Legacy: подходы сгруппированы по упражнениям",
    )
    avg_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    preset_id: Optional[int] = None
    is_circuit: bool = Field(
        False,
        description="Круговая тренировка: сохранить порядок подходов (order_index)",
    )
    edit_session_date: Optional[str] = Field(
        None,
        description="При редактировании: дата исходной сессии (для сохранения пульса)",
    )
    edit_session_title: Optional[str] = Field(
        None,
        description="При редактировании: название исходной сессии (для сохранения пульса)",
    )

    @field_validator("date")
    @classmethod
    def _date_not_future(cls, value: str) -> str:
        return _normalize_api_date(value)

    @model_validator(mode="after")
    def _sets_or_exercises(self) -> "StrengthWorkoutCreate":
        has_sets = bool(self.sets)
        has_exercises = bool(self.exercises)
        if has_sets and has_exercises:
            raise ValueError("Укажите sets или exercises, не оба одновременно")
        if not has_sets and not has_exercises:
            raise ValueError("Нужен непустой список sets или exercises")
        return self


class StrengthWorkoutCreateResponse(BaseModel):
    """Ответ после сохранения силовой тренировки."""

    inserted_sets: int
    workout_id: int
    message: str = "ok"


class StrengthProgressPoint(BaseModel):
    """Прогресс по упражнению за день (макс. 1ПМ среди подходов)."""

    date: str
    max_weight: float
    max_1rm: float
    epley_1rm: float


class StrengthOneRmChartPoint(BaseModel):
    """Точка графика e1RM по дням."""

    date: str
    epley_1rm: float


class StrengthNextWorkoutSuggestion(BaseModel):
    """Подсказка увеличить вес на следующей тренировке."""

    should_increase: bool
    suggested_increment: Optional[float] = None
    reason: Optional[str] = None
    equipment_type: Optional[str] = Field(
        None,
        description="barbell | dumbbell | unknown — тип снаряда по названию упражнения",
    )


class StrengthVolumeDay(BaseModel):
    """Суммарный объём нагрузки за день."""

    date: str
    volume_kg: float


class DailyTrimpPoint(BaseModel):
    date: str
    trimp: float


class CtlAtlTsbPoint(BaseModel):
    date: str
    trimp: float
    ctl: float
    atl: float
    tsb: float


class CtlAtlTsbCurrent(BaseModel):
    ctl: Optional[float] = None
    atl: Optional[float] = None
    tsb: Optional[float] = None
    trimp: Optional[float] = None
    last_workout_date: Optional[str] = None


class CtlAtlTsbResponse(BaseModel):
    items: list[CtlAtlTsbPoint]
    current: CtlAtlTsbCurrent = Field(default_factory=CtlAtlTsbCurrent)


class DailyTrimpResponse(BaseModel):
    items: list[DailyTrimpPoint]


class StepsHistoryPoint(BaseModel):
    date: str
    steps: int
    step_length_m: Optional[float] = None
    distance_km: Optional[float] = None
    source: Optional[str] = None


class StepsYearlyTotal(BaseModel):
    year: int
    total_steps: int
    months_count: int
    avg_monthly_steps: float


class StepsHistorySummary(BaseModel):
    count: int = 0
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    latest: Optional[StepsHistoryPoint] = None
    total_steps_all: Optional[int] = None
    avg_monthly_steps: Optional[float] = None


class StepsHistoryResponse(BaseModel):
    items: list[StepsHistoryPoint]
    yearly: list[StepsYearlyTotal] = Field(default_factory=list)
    summary: StepsHistorySummary = Field(default_factory=StepsHistorySummary)


class StepsHistoryUpsert(BaseModel):
    """Ручная запись месячных шагов (дата — любой день месяца, хранится как YYYY-MM-01)."""

    date: str
    steps: int = Field(gt=0, description="Шаги за месяц")
    step_length_m: Optional[float] = Field(None, gt=0, description="Средняя длина шага, м")
    distance_km: Optional[float] = Field(None, gt=0, description="Дистанция за месяц, км")

    @model_validator(mode="after")
    def _step_length_or_distance(self) -> "StepsHistoryUpsert":
        if self.step_length_m is None and self.distance_km is None:
            raise ValueError("Укажите длину шага (м) или дистанцию (км)")
        return self

    @field_validator("date")
    @classmethod
    def _validate_date(cls, value: str) -> str:
        return _normalize_api_date(value)


class StepsHistoryUpsertResponse(BaseModel):
    status: str
    item: StepsHistoryPoint


class StepsSyncResponse(BaseModel):
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    parsed_from_file: int = 0
    total_in_db: int = 0
    file_path: str = ""
    message: str = ""


class StrengthVolumeResponse(BaseModel):
    items: list[StrengthVolumeDay]


class TopExerciseProgress(BaseModel):
    exercise: str
    current_1rm: Optional[float] = None
    past_1rm: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None


class TopExercisesProgressResponse(BaseModel):
    items: list[TopExerciseProgress]


class ZoneTimeItem(BaseModel):
    zone_id: str
    name: str
    seconds: float
    minutes: float
    percent: float


class ZoneTimeTypeOption(BaseModel):
    """Тип тренировки для фильтра zone-time (кардио или силовые)."""

    id: str = Field(description="Пустая строка — все; __strength__ — силовые; иначе тип кардио")
    label: str


class ZoneTimeResponse(BaseModel):
    days: int
    max_heart_rate: int
    workout_type: Optional[str] = None
    zones: list[HeartRateZone]
    items: list[ZoneTimeItem]
    total_seconds: float
    available_types: list[ZoneTimeTypeOption] = Field(default_factory=list)
    workouts_with_hr: int = 0


# ---------------------------------------------------------------------------
# Кардио
# ---------------------------------------------------------------------------


class CardioWorkout(BaseModel):
    """Строка списка кардио-тренировок."""

    id: int
    date: str
    type: str
    distance_km: float = 0.0
    duration_sec: int = 0
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    calories: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    avg_cadence: Optional[float] = None
    start_time: Optional[str] = None
    data_source: Optional[str] = None
    avg_speed_kmh: Optional[float] = None
    max_speed_kmh: Optional[float] = None
    avg_power: Optional[int] = None
    max_power: Optional[int] = None
    has_power_data: Optional[bool] = None
    avg_power_watts: Optional[float] = None
    estimated_avg_power_watts: Optional[float] = None
    power_source: Optional[str] = None
    swolf: Optional[int] = None
    pace_min_km: Optional[float] = None
    pace_sec_100m: Optional[float] = None
    source_summary: Optional["WorkoutSourceSummary"] = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_row(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        row = dict(data)
        if row.get("calories") is None:
            row["calories"] = row.get("calories_chest") or row.get("calories_watch")
        if row.get("distance_km") is None:
            row["distance_km"] = 0.0
        if row.get("duration_sec") is None:
            row["duration_sec"] = 0
        if row.get("type") == CARDIO_DB_BIKE:
            row["swolf"] = None
        if row.get("avg_cadence") is not None:
            try:
                row["avg_cadence"] = round(float(row["avg_cadence"]), 1)
            except (TypeError, ValueError):
                row["avg_cadence"] = None
        return row


class CardioDetail(BaseModel):
    """Полная карточка кардио с пульсом и GPS."""

    id: int
    date: str
    type: str
    distance_km: float
    duration_sec: int
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    swolf: Optional[int] = None
    # [{"seconds": int, "heart_rate": int}]
    heart_rate_data: Optional[list[dict[str, Any]]] = None
    gps_geojson: Optional[str] = None
    source_summary: Optional["WorkoutSourceSummary"] = None


class MetricSourceInfo(BaseModel):
    metric: str
    effective_source: Optional[str] = None
    effective_label: Optional[str] = None
    fallback_sources: list[str] = Field(default_factory=list)
    fallback_labels: list[str] = Field(default_factory=list)
    is_fallback: bool = False
    source_provider: Optional[str] = None


class LinkedSourceInfo(BaseModel):
    workout_id: int
    link_reason: str
    confidence: Optional[str] = None


class SourceConflictValue(BaseModel):
    source_type: str
    label: str
    value: int


class SourceConflict(BaseModel):
    metric: str
    message: str
    values: list[SourceConflictValue] = Field(default_factory=list)


class WorkoutSourceView(BaseModel):
    workout_id: int
    primary_source_type: str
    primary_provider: Optional[str] = None
    primary_label: str
    metrics: list[MetricSourceInfo] = Field(default_factory=list)
    linked_sources: list[LinkedSourceInfo] = Field(default_factory=list)
    conflicts: list[SourceConflict] = Field(default_factory=list)
    has_conflicts: bool = False


class WorkoutSourceSummary(BaseModel):
    primary_label: Optional[str] = None
    primary_source_type: Optional[str] = None
    hr_label: Optional[str] = None
    hr_fallback: bool = False
    calories_label: Optional[str] = None
    calories_fallback: bool = False
    gps_label: Optional[str] = None
    has_conflicts: bool = False


class SourcePriorityPrefs(BaseModel):
    hr: list[str] = Field(default_factory=list)
    workout_calories: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    weight: list[str] = Field(default_factory=list)
    gps: list[str] = Field(default_factory=list)
    metadata: list[str] = Field(default_factory=list)


class CardioWorkoutCreate(BaseModel):
    """Тело POST-запроса: ручной ввод кардио."""

    date: str
    type: str
    distance_km: float = Field(..., ge=0)
    duration_min: int = Field(0, ge=0)
    duration_sec: int = Field(0, ge=0)
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    avg_cadence: Optional[float] = None
    swolf: Optional[int] = None

    @field_validator("date")
    @classmethod
    def _date_not_future(cls, value: str) -> str:
        return _normalize_api_date(value)

    @field_validator("type")
    @classmethod
    def _type_allowed(cls, value: str) -> str:
        t = str(value).strip()
        if t not in ALLOWED_CARDIO_TYPES:
            allowed = ", ".join(sorted(ALLOWED_CARDIO_TYPES))
            raise ValueError(
                f"Недопустимый тип кардио «{t}». Допустимо: {allowed}"
            )
        return t


class CardioWorkoutUpdate(BaseModel):
    """Тело PUT-запроса: частичное обновление кардио."""

    date: Optional[str] = None
    type: Optional[str] = None
    distance_km: Optional[float] = Field(None, ge=0)
    duration_min: Optional[int] = Field(None, ge=0)
    duration_sec: Optional[int] = Field(None, ge=0)
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    calories_chest: Optional[int] = None
    calories_watch: Optional[int] = None
    avg_cadence: Optional[float] = None
    swolf: Optional[int] = None
    data_source: Optional[str] = None

    @field_validator("date")
    @classmethod
    def _date_not_future_optional(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return _normalize_api_date(value)

    @field_validator("type")
    @classmethod
    def _type_allowed_optional(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        t = str(value).strip()
        if t not in ALLOWED_CARDIO_TYPES:
            allowed = ", ".join(sorted(ALLOWED_CARDIO_TYPES))
            raise ValueError(
                f"Недопустимый тип кардио «{t}». Допустимо: {allowed}"
            )
        return t


class HeartRatePoint(BaseModel):
    """Точка пульса для отдельного эндпоинта /hr."""

    seconds: int
    heart_rate: int
    elapsed_sec: Optional[int] = None
    distance_m: Optional[float] = None
    source_type: Optional[str] = Field(
        None,
        description="Тип тренировки-владельца: cardio, strength и т.д.",
    )


class HeartRateResponse(BaseModel):
    """Массив пульса по cardio_workout_id."""

    workout_id: int
    points: list[HeartRatePoint]
    count: int = 0
    message: Optional[str] = None
    min_elapsed_sec: Optional[int] = None
    max_elapsed_sec: Optional[int] = None


class PowerSeriesPoint(BaseModel):
    elapsed_sec: int
    power_watts: float


class WorkoutPowerResponse(BaseModel):
    """GET /api/cardio/{id}/power."""

    workout_id: int
    has_real: bool = False
    has_estimated: bool = False
    avg_power: Optional[float] = None
    source: Optional[str] = None
    series: list[PowerSeriesPoint] = []


class BikeSettings(BaseModel):
    id: int
    user_id: int = 1
    bike_weight_kg: float
    rider_weight_kg: Optional[float] = None
    tire_type: str = "road_slick"
    tire_width_mm: int = 25
    wheel_size_inch: float = 28.0
    default_route_surface: str = "asphalt"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    suggested_rider_weight_kg: Optional[float] = None
    effective_rider_weight_kg: Optional[float] = None
    effective_crr: Optional[float] = None
    tire_options: list[dict[str, Any]] = []
    surface_options: list[dict[str, Any]] = []


class BikeSettingsSave(BaseModel):
    bike_weight_kg: Optional[float] = Field(None, gt=0)
    rider_weight_kg: Optional[float] = None
    tire_type: Optional[str] = None
    tire_width_mm: Optional[int] = Field(None, ge=18, le=60)
    wheel_size_inch: Optional[float] = None
    default_route_surface: Optional[str] = None

    @field_validator("rider_weight_kg")
    @classmethod
    def _rider_weight_positive(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if value <= 0:
            raise ValueError("rider_weight_kg должно быть > 0")
        return value


class WorkoutSensorsResponse(BaseModel):
    """Временные ряды датчиков велотренировки (FIT record)."""

    workout_id: int
    start_time: Optional[str] = None
    elapsed_sec: list[int] = []
    speed_kmh: list[Optional[float]] = []
    cadence: list[Optional[float]] = []
    elevation_m: list[Optional[float]] = []
    temperature_c: list[Optional[float]] = []
    distance_m: list[Optional[float]] = []
    heart_rate: list[Optional[int]] = []
    has_cadence: bool = False
    has_elevation: bool = False
    has_temperature: bool = False
    has_speed: bool = False


# ---------------------------------------------------------------------------
# Замеры тела
# ---------------------------------------------------------------------------


class BodyMetric(BaseModel):
    """Один замер тела (все измерения за дату)."""

    date: str
    weight_kg: Optional[float] = None
    body_fat_percent: Optional[float] = None
    muscle_mass_kg: Optional[float] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    bicep_cm: Optional[float] = None
    calf_cm: Optional[float] = None
    thigh_cm: Optional[float] = None


class GeneticLimitResponse(BaseModel):
    """Генетический предел сухой массы (FFMI = 25)."""

    status: str
    message: Optional[str] = None
    lean_mass: Optional[float] = None
    max_lean_mass: Optional[float] = None
    percent: Optional[float] = None
    remaining_kg: Optional[float] = None
    measurement_date: Optional[str] = None
    weight_kg: Optional[float] = None
    body_fat_percent: Optional[float] = None
    weight_date: Optional[str] = None
    body_fat_date: Optional[str] = None
    disclaimer: str = ""
    ffmi_limit: float = 25.0
    interpretation: Optional[str] = None
    level: Optional[str] = None


class BodyMetricCreate(BaseModel):
    """Тело POST-запроса: новый замер тела."""

    date: str
    allow_replace: bool = False
    weight_kg: Optional[float] = None
    body_fat_percent: Optional[float] = None
    muscle_mass_kg: Optional[float] = None
    chest_inhale_cm: Optional[float] = None
    chest_exhale_cm: Optional[float] = None
    bicep_relaxed_cm: Optional[float] = None
    bicep_tense_cm: Optional[float] = None
    forearm_relaxed_cm: Optional[float] = None
    forearm_tense_cm: Optional[float] = None
    wrist_cm: Optional[float] = None
    thigh_relaxed_cm: Optional[float] = None
    thigh_tense_cm: Optional[float] = None
    calf_relaxed_cm: Optional[float] = None
    calf_tense_cm: Optional[float] = None
    ankle_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    neck_cm: Optional[float] = None

    @field_validator("date")
    @classmethod
    def _date_not_future(cls, value: str) -> str:
        return _normalize_api_date(value)

    @field_validator("weight_kg")
    @classmethod
    def _weight_positive_if_set(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if float(value) <= 0:
            raise ValueError("weight_kg должен быть > 0, если указан")
        return float(value)

    @field_validator(
        "body_fat_percent",
        "muscle_mass_kg",
        "chest_inhale_cm",
        "chest_exhale_cm",
        "bicep_relaxed_cm",
        "bicep_tense_cm",
        "forearm_relaxed_cm",
        "forearm_tense_cm",
        "wrist_cm",
        "thigh_relaxed_cm",
        "thigh_tense_cm",
        "calf_relaxed_cm",
        "calf_tense_cm",
        "ankle_cm",
        "waist_cm",
        "hips_cm",
        "neck_cm",
    )
    @classmethod
    def _non_negative_optional(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if float(value) < 0:
            raise ValueError("Значение не может быть отрицательным")
        return float(value)

    def to_service_payload(self) -> dict[str, Any]:
        """Преобразование в формат body_service (поле fields)."""
        skip = {"date", "allow_replace"}
        fields = {
            k: v
            for k, v in self.model_dump().items()
            if k not in skip and v is not None
        }
        return {
            "date": self.date,
            "allow_replace": self.allow_replace,
            "fields": fields,
        }


class BodyMetricCreateResponse(BaseModel):
    """Статус сохранения замера: ok | duplicate | empty."""

    status: str


# ---------------------------------------------------------------------------
# Профиль пользователя
# ---------------------------------------------------------------------------


class HeartRateZone(BaseModel):
    """Зона пульса (% и уд/мин от max HR)."""

    id: str
    name: str
    pct_min: int
    pct_max: int
    min_bpm: int
    max_bpm: int


class UserProfile(BaseModel):
    """GET/POST /api/user/profile."""

    id: int = 1
    date_of_birth: Optional[str] = None
    height_cm: Optional[float] = None
    max_heart_rate: Optional[int] = None
    updated_at: Optional[str] = None
    effective_max_heart_rate: int
    max_hr_source: str = Field(
        description="profile | formula | default — откуда взят effective_max_heart_rate",
    )
    heart_rate_zones: list[HeartRateZone] = Field(default_factory=list)
    sex: str = Field(default="male", description="male | female")
    week_start_day: int = Field(default=5, ge=0, le=6, description="0=пн … 6=вс")
    week_start_label: Optional[str] = None
    cloud_sync_provider: str = Field(default="yandex", description="yandex | google")
    units_system: str = Field(default="metric", description="metric | american")

    @field_validator("units_system")
    @classmethod
    def _normalize_units_system(cls, value: str) -> str:
        units = str(value or "metric").strip().lower()
        return units if units in ("metric", "american") else "metric"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    effective_display_name: Optional[str] = Field(
        None,
        description="display_name или «Имя Фамилия», если заданы",
    )
    max_deficit_per_kg_fat: Optional[float] = Field(
        None, description="Макс. безопасный дефицит ккал/кг жира в день (сушка, рекомендация)"
    )
    max_physiological_deficit_per_kg_fat: Optional[float] = Field(
        None, description="Физиологический предел дефицита ккал/кг жира в день (сушка)"
    )
    target_bulk_grams_per_week: Optional[float] = Field(
        None, description="Целевой набор массы, г/неделю"
    )
    use_chest_strap_priority: bool = Field(
        True, description="Приоритет calories_chest при расчёте расхода"
    )


class UserProfileUpdate(BaseModel):
    """Тело POST /api/user/profile."""

    date_of_birth: Optional[str] = None
    height_cm: Optional[float] = Field(None, ge=50, le=250)
    max_heart_rate: Optional[int] = Field(None, ge=100, le=230)
    sex: Optional[str] = Field(None, description="male | female")
    week_start_day: Optional[int] = Field(None, ge=0, le=6)
    cloud_sync_provider: Optional[str] = Field(None, description="yandex | google")
    units_system: Optional[str] = Field(None, description="metric | american")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    max_deficit_per_kg_fat: Optional[float] = Field(
        None,
        ge=5,
        le=70,
        description="Макс. безопасный дефицит ккал/кг жира в день (5–70)",
    )
    max_physiological_deficit_per_kg_fat: Optional[float] = Field(None, ge=50, le=100)
    target_bulk_grams_per_week: Optional[float] = Field(None, ge=50, le=2000)
    use_chest_strap_priority: Optional[bool] = None

    @field_validator("units_system")
    @classmethod
    def _units_ok(cls, value: str | None) -> str | None:
        if value is None:
            return None
        units = str(value).strip().lower()
        if units not in ("metric", "american"):
            raise ValueError("units_system: metric или american")
        return units

    @field_validator("date_of_birth")
    @classmethod
    def _dob_ok(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return _normalize_api_date(value)


class NutritionSettings(BaseModel):
    protein_gram_per_kg: Optional[float] = None
    fat_gram_per_kg: Optional[float] = None
    carbs_gram_per_kg: Optional[float] = None
    activity_level: Optional[str] = Field(None, description="sedentary | active")


class NutritionSettingsSave(BaseModel):
    protein_gram_per_kg: Optional[float] = Field(None, ge=0)
    fat_gram_per_kg: Optional[float] = Field(None, ge=0)
    carbs_gram_per_kg: Optional[float] = Field(None, ge=0)
    activity_level: Optional[str] = Field(None, description="sedentary | active")


class BraceletCalibrationStatus(BaseModel):
    factor: float = Field(1.0, description="Множитель для corrected activity calories")
    last_calibration_date: Optional[str] = None
    calibration_stale: bool = Field(
        False,
        description="True, если с последнего пересчёта прошло ≥14 дней",
    )


class BraceletCalibrationRecalculateResult(BaseModel):
    old_factor: float
    new_factor: float
    last_calibration_date: str
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    predicted_deficit_kcal: Optional[float] = None
    observed_deficit_kcal: Optional[float] = None
    total_intake_kcal: Optional[float] = None
    total_predicted_expenditure_kcal: Optional[float] = None
    weight_measurements: Optional[int] = None
    food_days: Optional[int] = None
    bracelet_days: Optional[int] = None
    status: Optional[str] = None
    note: Optional[str] = None


class IntegrationSettings(BaseModel):
    fit_folder_path: Optional[str] = Field(
        None,
        description="Путь к папке с FIT-файлами (абсолютный или относительно корня проекта)",
    )
    effective_fit_folder_path: Optional[str] = Field(
        None,
        description="Разрешённый путь, который использует импорт при текущих настройках",
    )


class IntegrationSettingsSave(BaseModel):
    fit_folder_path: Optional[str] = Field(
        None,
        description="Пустая строка или null — сброс на путь по умолчанию",
    )


class BackupSettings(BaseModel):
    backup_folder_path: Optional[str] = Field(
        None,
        description="Папка для ежемесячных локальных бэкапов (ZIP: workouts.db + shared.db)",
    )
    last_backup_date: Optional[str] = Field(
        None,
        description="ISO-дата последнего успешного локального бэкапа",
    )


class BackupSettingsSave(BaseModel):
    backup_folder_path: Optional[str] = Field(
        None,
        description="Абсолютный или относительный путь к папке бэкапов",
    )


class BackupNowResult(BaseModel):
    success: bool
    backup_path: Optional[str] = None
    backup_name: Optional[str] = None
    error: Optional[str] = None
    workouts_bytes: Optional[int] = None
    shared_bytes: Optional[int] = None
    zip_bytes: Optional[int] = None


class AnalyticsSettings(BaseModel):
    include_warmup_in_analytics: bool = Field(
        False,
        description="Учитывать разминочные подходы в графиках прогресса и объёме",
    )
    hc_analytics: "HcAnalyticsPrefs" = Field(default_factory=lambda: HcAnalyticsPrefs())


class HcAnalyticsPrefs(BaseModel):
    use_in_analytics: bool = Field(
        False,
        description="Мастер-переключатель: данные Health Connect участвуют в аналитике",
    )
    steps: bool = False
    sleep: bool = False
    heart_rate: bool = False
    active_calories: bool = False
    workout_calories: bool = False
    total_calories: bool = False
    weight: bool = False


class HcAnalyticsPrefsSave(BaseModel):
    use_in_analytics: bool | None = None
    steps: bool | None = None
    sleep: bool | None = None
    heart_rate: bool | None = None
    active_calories: bool | None = None
    workout_calories: bool | None = None
    total_calories: bool | None = None
    weight: bool | None = None


class AnalyticsSettingsSave(BaseModel):
    include_warmup_in_analytics: bool | None = Field(
        None,
        description="true — включать разминочные подходы в силовую аналитику",
    )
    hc_analytics: HcAnalyticsPrefsSave | None = None


class DailyFiberTarget(BaseModel):
    recommended_grams: float = 30.0
    current_grams: Optional[float] = None


class LevelCalculationRequest(BaseModel):
    pass


class LevelCalculationResponse(BaseModel):
    status: str
    missing_fields: list[str] = Field(default_factory=list)
    missing_hints: list[str] = Field(default_factory=list)
    recommendations: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Дневник питания
# ---------------------------------------------------------------------------

ALLOWED_MEAL_TYPES = frozenset({"breakfast1", "breakfast2", "lunch", "dinner", "snack"})
_LEGACY_MEAL_TYPE_BREAKFAST = "breakfast"


def _normalize_meal_type(value: str) -> str:
    mt = value.strip().lower()
    if mt == _LEGACY_MEAL_TYPE_BREAKFAST:
        return "breakfast1"
    return mt
ALLOWED_FOOD_PHASES = frozenset({"cut", "bulk"})


class MacroTotals(BaseModel):
    protein: float = 0
    fat: float = 0
    carbs: float = 0
    calories: float = 0
    fiber: float = 0


class FoodProduct(BaseModel):
    id: int
    name: str
    protein: float = 0
    fat: float = 0
    carbs: float = 0
    calories: float = 0
    fiber_g: float = 0
    vitamin_c_mg: float = 0
    vitamin_d_mcg: float = 0
    vitamin_b12_mcg: float = 0
    calcium_mg: float = 0
    iron_mg: float = 0
    magnesium_mg: float = 0
    zinc_mg: float = 0
    potassium_mg: float = 0
    sodium_mg: float = 0
    unit: str = "g"
    is_composite: bool = False
    is_alcohol: bool = False
    external_id: Optional[str] = None
    default_portion_g: Optional[float] = Field(None, gt=0)


class FoodCompositeComponentCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity_g: float = Field(..., gt=0)


class FoodCompositeCreate(BaseModel):
    name: str = Field(..., min_length=1)
    components: list[FoodCompositeComponentCreate] = Field(..., min_length=1)
    total_weight_g: Optional[float] = Field(None, gt=0)


class FoodCompositeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    components: list[FoodCompositeComponentCreate] = Field(..., min_length=1)
    total_weight_g: Optional[float] = Field(None, gt=0)


class FoodCompositeComponentDetail(BaseModel):
    product_id: int
    product_name: str
    quantity_g: float = Field(..., gt=0)


class FoodProductDetail(FoodProduct):
    components: Optional[list[FoodCompositeComponentDetail]] = None


class FoodEntry(BaseModel):
    id: int
    date: str
    phase: str = "cut"
    product_id: int
    product_name: str
    quantity: float = Field(..., gt=0)
    meal_type: str
    protein: float = 0
    fat: float = 0
    carbs: float = 0
    calories: float = 0
    fiber: float = 0
    is_alcohol: bool = False
    notes: Optional[str] = None


class FoodEntryCreate(BaseModel):
    date: str
    phase: str = "cut"
    product_id: int = Field(..., gt=0)
    quantity: float = Field(100, gt=0)
    meal_type: str
    notes: Optional[str] = None

    @field_validator("date")
    @classmethod
    def _date_ok(cls, value: str) -> str:
        return _normalize_food_date(value)

    @field_validator("phase")
    @classmethod
    def _phase_ok(cls, value: str) -> str:
        p = value.strip().lower()
        if p not in ALLOWED_FOOD_PHASES:
            raise ValueError("phase: cut или bulk")
        return p

    @field_validator("meal_type")
    @classmethod
    def _meal_type_ok(cls, value: str) -> str:
        mt = _normalize_meal_type(value)
        if mt not in ALLOWED_MEAL_TYPES:
            raise ValueError(
                "meal_type: breakfast1, breakfast2, lunch, dinner или snack"
            )
        return mt


class FoodEntryUpdate(BaseModel):
    product_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[float] = Field(None, gt=0)
    meal_type: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("meal_type")
    @classmethod
    def _meal_type_ok(cls, value: str | None) -> str | None:
        if value is None:
            return None
        mt = _normalize_meal_type(value)
        if mt not in ALLOWED_MEAL_TYPES:
            raise ValueError(
                "meal_type: breakfast1, breakfast2, lunch, dinner или snack"
            )
        return mt


class NutritionGoals(BaseModel):
    date: str
    phase: str = "cut"
    protein_goal: Optional[float] = Field(None, ge=0)
    fat_goal: Optional[float] = Field(None, ge=0)
    carbs_goal: Optional[float] = Field(None, ge=0)
    calories_goal: Optional[float] = Field(None, ge=0)


class NutritionGoalsSave(BaseModel):
    protein_goal: Optional[float] = Field(None, ge=0)
    fat_goal: Optional[float] = Field(None, ge=0)
    carbs_goal: Optional[float] = Field(None, ge=0)
    calories_goal: Optional[float] = Field(None, ge=0)


class GoalPercents(BaseModel):
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    calories: Optional[float] = None


class ExpenditureInfo(BaseModel):
    bmr: Optional[float] = None
    cardio_kcal: float = 0
    strength_kcal: float = 0
    workout_kcal: float = 0
    activity_kcal: float = 0
    tef_kcal: float = 0
    total_burn: Optional[float] = None
    balance: Optional[float] = None
    bmr_available: bool = False
    bmr_note: Optional[str] = None
    sex_used: str = "male"
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    age_years: Optional[int] = None


class TefInfo(BaseModel):
    base_calories: float = 0
    tef_kcal: float = 0
    net_calories: float = 0
    protein_tef: float = 0
    fat_tef: float = 0
    carbs_tef: float = 0


class MacroCalorieShare(BaseModel):
    key: str
    label: str
    grams: float = 0
    kcal: float = 0
    percent: float = 0


class PerKgMacro(BaseModel):
    key: str
    label: str
    current_g_per_kg: Optional[float] = None
    target_g_per_kg: Optional[float] = None
    status: str = "unknown"


class NutritionInsights(BaseModel):
    tef: TefInfo
    tef_help: Optional[TefHelp] = None
    macro_calorie_shares: list[MacroCalorieShare] = []
    per_kg: list[PerKgMacro] = []


class KcalPerKgMetric(BaseModel):
    value: Optional[float] = None
    status: str = "unknown"
    ranges: dict[str, float] = {}
    tooltips: dict[str, str] = {}
    note: Optional[str] = None
    avg_daily_expenditure_kcal: Optional[float] = None
    deficit_per_kg_body: Optional[float] = None
    expenditure_without_tef_kcal: Optional[float] = None
    fat_mass_kg: Optional[float] = None
    deficit_per_kg_fat: Optional[float] = None


class BodyFatCategory(BaseModel):
    key: str
    label: str
    min: float
    max: float
    color: str = "neutral"


class BodyFatScale(BaseModel):
    sex: str = "male"
    percent: Optional[float] = None
    category: Optional[BodyFatCategory] = None
    position_in_category: Optional[float] = None
    status: str = "unknown"
    categories: list[BodyFatCategory] = []


class HealthWarning(BaseModel):
    level: str
    code: str
    message: str


class TefMacroCoefficient(BaseModel):
    key: str
    label: str
    min_pct: int
    max_pct: int
    rate_used: float


class TefHelp(BaseModel):
    description: str = ""
    macro_coefficients: list[TefMacroCoefficient] = []
    tef_kcal_in_calculation: Optional[float] = None


class WeekNutritionAnalytics(BaseModel):
    kcal_per_kg_body: Optional[KcalPerKgMetric] = None
    kcal_per_kg_fat: Optional[KcalPerKgMetric] = None
    body_fat_scale: Optional[BodyFatScale] = None
    tef_help: Optional[TefHelp] = None
    health_warnings: list[HealthWarning] = []


class ForecastTarget(BaseModel):
    target_value: float
    current_value: float
    rate_per_week: Optional[float] = None
    estimated_days: Optional[int] = None
    estimated_weeks: Optional[float] = None
    estimated_date: Optional[str] = None


class ProgressConfidence(BaseModel):
    level: str = "low"
    score: Optional[float] = None
    message: Optional[str] = None


class ProgressForecast(BaseModel):
    phase: str
    sufficient_data: bool = False
    observation_count: int = 0
    confidence: ProgressConfidence
    avg_daily_calories: Optional[float] = None
    avg_daily_expenditure: Optional[float] = None
    weight_trend_per_week: Optional[float] = None
    fat_trend_per_week: Optional[float] = None
    forecasts: dict[str, ForecastTarget] = {}


class CutBulkProgressResponse(BaseModel):
    snapshot: dict[str, Any] = {}
    plan: dict[str, Any] = {}
    progress: ProgressForecast
    body_fat_scale: Optional[BodyFatScale] = None
    health_warnings: list[HealthWarning] = []


class BodyNutritionSummary(BaseModel):
    weight_kg: Optional[float] = None
    body_fat_percent: Optional[float] = None
    lean_mass_kg: Optional[float] = None
    goal_label: str = ""
    phase: str = "cut"


class DayExpenditureBreakdown(BaseModel):
    date: str
    bmr: Optional[float] = None
    activity_kcal: float = 0
    workout_kcal: float = 0
    tef_kcal: float = 0
    total_out_kcal: Optional[float] = None
    intake_kcal: float = 0
    balance_kcal: Optional[float] = None


class WeekExpenditureTotals(BaseModel):
    bmr: float = 0
    activity_kcal: float = 0
    workout_kcal: float = 0
    tef_kcal: float = 0
    total_out_kcal: float = 0
    intake_kcal: float = 0
    balance_kcal: float = 0


class FoodDayResponse(BaseModel):
    date: str
    phase: str = "cut"
    entries: list[FoodEntry]
    by_meal: dict[str, list[FoodEntry]]
    by_meal_totals: dict[str, MacroTotals] = {}
    daily_totals: MacroTotals
    alcohol_calories: float = 0
    goals: Optional[NutritionGoals] = None
    goal_percent: Optional[GoalPercents] = None
    expenditure: ExpenditureInfo
    body_summary: BodyNutritionSummary
    insights: NutritionInsights
    daily_fiber_target: DailyFiberTarget = Field(default_factory=DailyFiberTarget)
    current_fiber: float = 0
    suggested_meal_plan_id: Optional[int] = None
    suggested_meal_plan_name: Optional[str] = None
    suggested_plan_reason: Optional[str] = None


class FoodWeekDaySummary(BaseModel):
    date: str
    daily_totals: MacroTotals
    is_sunday: bool = False
    expenditure: Optional[DayExpenditureBreakdown] = None


class FoodWeekResponse(BaseModel):
    week_start: str
    week_end: str
    week_number: int = 0
    phase: str = "cut"
    days: list[FoodWeekDaySummary]
    week_totals: MacroTotals
    alcohol_calories: float = 0
    week_daily_average: MacroTotals
    body_summary: BodyNutritionSummary
    insights: NutritionInsights
    expenditure_by_day: list[DayExpenditureBreakdown] = []
    week_expenditure_totals: WeekExpenditureTotals
    analytics: Optional[WeekNutritionAnalytics] = None
    daily_fiber_target: DailyFiberTarget = Field(default_factory=DailyFiberTarget)
    current_fiber: float = 0


class FoodClearDayResponse(BaseModel):
    deleted: int
    date: str
    phase: str = "cut"
    message: str = ""


class FoodProductComponentCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)


class FoodProductCreate(BaseModel):
    name: str = Field(..., min_length=1)
    protein: float = Field(0, ge=0)
    fat: float = Field(0, ge=0)
    carbs: float = Field(0, ge=0)
    fiber_g: float = Field(0, ge=0)
    calories: Optional[float] = Field(None, ge=0)
    is_alcohol: bool = False
    vitamin_c_mg: float = Field(0, ge=0)
    vitamin_d_mcg: float = Field(0, ge=0)
    vitamin_b12_mcg: float = Field(0, ge=0)
    calcium_mg: float = Field(0, ge=0)
    iron_mg: float = Field(0, ge=0)
    magnesium_mg: float = Field(0, ge=0)
    zinc_mg: float = Field(0, ge=0)
    potassium_mg: float = Field(0, ge=0)
    sodium_mg: float = Field(0, ge=0)
    external_id: Optional[str] = Field(
        None,
        description="Штрихкод Open Food Facts",
        max_length=14,
    )
    contribute_to_openfoodfacts: bool = Field(
        False,
        description="После сохранения отправить продукт в Open Food Facts",
    )
    brand: Optional[str] = Field(None, max_length=200, description="Бренд для OFF")
    components: Optional[list[FoodProductComponentCreate]] = None
    total_weight_g: Optional[float] = Field(None, gt=0)
    default_portion_g: Optional[float] = Field(None, gt=0)


class FoodProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    protein: Optional[float] = Field(None, ge=0)
    fat: Optional[float] = Field(None, ge=0)
    carbs: Optional[float] = Field(None, ge=0)
    fiber_g: Optional[float] = Field(None, ge=0)
    calories: Optional[float] = Field(None, ge=0)
    is_alcohol: Optional[bool] = None
    vitamin_c_mg: Optional[float] = Field(None, ge=0)
    vitamin_d_mcg: Optional[float] = Field(None, ge=0)
    vitamin_b12_mcg: Optional[float] = Field(None, ge=0)
    calcium_mg: Optional[float] = Field(None, ge=0)
    iron_mg: Optional[float] = Field(None, ge=0)
    magnesium_mg: Optional[float] = Field(None, ge=0)
    zinc_mg: Optional[float] = Field(None, ge=0)
    potassium_mg: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    external_id: Optional[str] = Field(None, max_length=14)
    default_portion_g: Optional[float] = Field(None, gt=0)


class OpenFoodFactsPreview(BaseModel):
    """Данные для подстановки в форму создания продукта."""

    name: str
    external_id: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    protein: float = 0
    fat: float = 0
    carbs: float = 0
    fiber_g: float = 0
    calories: float = 0
    is_alcohol: bool = False
    vitamin_c_mg: float = 0
    vitamin_d_mcg: float = 0
    vitamin_b12_mcg: float = 0
    calcium_mg: float = 0
    iron_mg: float = 0
    magnesium_mg: float = 0
    zinc_mg: float = 0
    potassium_mg: float = 0
    sodium_mg: float = 0


class OpenFoodFactsProductSummary(BaseModel):
    """Краткие данные продукта для подстановки в форму."""

    name: str
    barcode: Optional[str] = None
    calories: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    carbs: Optional[float] = None
    fiber: Optional[float] = None


class OpenFoodFactsBarcodeResponse(BaseModel):
    found: bool
    barcode: Optional[str] = None
    source: str = Field(
        default="none",
        description="local | cache | api | none",
    )
    message: Optional[str] = None
    product: Optional[OpenFoodFactsProductSummary] = None
    preview: Optional[OpenFoodFactsPreview] = None
    existing_product: Optional[FoodProduct] = None
    local_name_matches: list[FoodProduct] = Field(default_factory=list)


class OpenFoodFactsSearchResponse(BaseModel):
    found: bool
    source: str = Field(default="none", description="cache | api | none")
    message: Optional[str] = None
    items: list[OpenFoodFactsProductSummary] = Field(default_factory=list)
    local_matches: list[FoodProduct] = Field(default_factory=list)


class OpenFoodFactsContributeBody(BaseModel):
    """Данные для создания карточки продукта в Open Food Facts."""

    barcode: str = Field(..., min_length=8, max_length=14)
    name: str = Field(..., min_length=1)
    brand: Optional[str] = Field(None, max_length=200)
    protein: float = Field(0, ge=0)
    fat: float = Field(0, ge=0)
    carbs: float = Field(0, ge=0)
    fiber_g: float = Field(0, ge=0)
    calories: float = Field(0, ge=0)


class OpenFoodFactsContributeResponse(BaseModel):
    ok: bool
    message: str
    barcode: Optional[str] = None
    off_status: Optional[str] = None


class MicroNutrientRow(BaseModel):
    key: str
    label: str
    unit: str
    consumed: float = 0
    goal: float = 0
    daily_goal: Optional[float] = None
    percent: Optional[float] = None
    has_data: bool = False


class MicrosDayResponse(BaseModel):
    date: str
    phase: str
    nutrients: list[MicroNutrientRow]
    has_entries: bool = False
    has_any_micro_data: bool = False


class MicrosWeekResponse(BaseModel):
    anchor_date: str
    week_start: str
    week_end: str
    phase: str
    nutrients: list[MicroNutrientRow]
    has_entries: bool = False
    has_any_micro_data: bool = False
    days_with_entries: int = 0


class MicroGoalItem(BaseModel):
    key: str
    label: str
    unit: str
    goal: float


class MicroGoalsResponse(BaseModel):
    nutrients: list[MicroGoalItem]
    goals: dict[str, float]


class MicroGoalsSave(BaseModel):
    goals: dict[str, Optional[float]] = Field(default_factory=dict)


class MealTemplateSummary(BaseModel):
    id: int
    name: str
    meal_type: str
    phase: str = "cut"
    items_count: int = 0


class MealTemplateItem(BaseModel):
    product_id: int
    product_name: str
    quantity: float
    protein: float = 0
    fat: float = 0
    carbs: float = 0
    calories: float = 0


class MealTemplateDetail(BaseModel):
    id: int
    name: str
    meal_type: str
    phase: str = "cut"
    items: list[MealTemplateItem]
    totals: MacroTotals


class MealTemplateItemIn(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)


class MealTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    items: Optional[list[MealTemplateItemIn]] = None


class ApplyTemplateRequest(BaseModel):
    template_id: int = Field(..., gt=0)
    date: str
    phase: str = "cut"
    meal_type: Optional[str] = None

    @field_validator("date")
    @classmethod
    def _date_ok(cls, value: str) -> str:
        return _normalize_api_date(value)

    @field_validator("phase")
    @classmethod
    def _phase_ok(cls, value: str) -> str:
        p = value.strip().lower()
        if p not in ALLOWED_FOOD_PHASES:
            raise ValueError("phase: cut или bulk")
        return p

    @field_validator("meal_type")
    @classmethod
    def _meal_type_ok(cls, value: str | None) -> str | None:
        if value is None:
            return None
        mt = _normalize_meal_type(value)
        if mt not in ALLOWED_MEAL_TYPES:
            raise ValueError(
                "meal_type: breakfast1, breakfast2, lunch, dinner или snack"
            )
        return mt


class ApplyTemplateResponse(BaseModel):
    added: int
    entries: list[FoodEntry]
    meal_type: str
    template_name: str


class MealPlanTemplateRef(BaseModel):
    template_id: int
    template_name: str
    meal_type: str
    sort_order: int
    items_count: int = 0


class MealPlanSummary(BaseModel):
    id: int
    name: str
    phase: str = "cut"
    description: Optional[str] = None
    meals_count: int = 0
    is_custom: bool = False
    is_weekly: bool = False
    uses_templates: bool = False


class MealPlanItemIn(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)


class MealPlanItemOut(BaseModel):
    product_id: int
    product_name: str
    quantity: float


class MealPlanMealIn(BaseModel):
    meal_type: str
    items: list[MealPlanItemIn] = Field(default_factory=list)


class MealPlanMealOut(BaseModel):
    meal_type: str
    items: list[MealPlanItemOut] = Field(default_factory=list)


class MealPlanDayIn(BaseModel):
    day_offset: int = Field(0, ge=0, le=6)
    meals: list[MealPlanMealIn] = Field(default_factory=list)


class MealPlanDayOut(BaseModel):
    day_offset: int
    meals: list[MealPlanMealOut] = Field(default_factory=list)


class MealPlanDetail(BaseModel):
    id: int
    name: str
    phase: str = "cut"
    description: Optional[str] = None
    is_custom: bool = False
    is_weekly: bool = False
    uses_templates: bool = False
    days: list[MealPlanDayOut] = Field(default_factory=list)
    templates: list[MealPlanTemplateRef] = Field(default_factory=list)


class MealPlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phase: str = "cut"
    description: Optional[str] = Field(None, max_length=500)
    is_weekly: bool = False
    days: list[MealPlanDayIn] = Field(default_factory=list)
    template_ids: list[int] = Field(default_factory=list)

    @field_validator("phase")
    @classmethod
    def _phase_ok(cls, value: str) -> str:
        p = value.strip().lower()
        if p not in ALLOWED_FOOD_PHASES:
            raise ValueError("phase: cut или bulk")
        return p


class MealPlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    is_weekly: Optional[bool] = None
    days: Optional[list[MealPlanDayIn]] = None
    template_ids: Optional[list[int]] = None


class ApplyMealPlanRangeRequest(BaseModel):
    start_date: str
    end_date: Optional[str] = None
    phase: str = "cut"
    overwrite: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def _date_ok(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_food_date(value)

    @field_validator("phase")
    @classmethod
    def _phase_ok(cls, value: str) -> str:
        p = value.strip().lower()
        if p not in ALLOWED_FOOD_PHASES:
            raise ValueError("phase: cut или bulk")
        return p


class WeeklyScheduleDay(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    meal_plan_id: Optional[int] = Field(None, gt=0)


class WeeklyScheduleSave(BaseModel):
    days: list[WeeklyScheduleDay] = Field(default_factory=list)


class WeeklyScheduleItem(BaseModel):
    day_of_week: int
    meal_plan_id: Optional[int] = None
    meal_plan_name: Optional[str] = None


class MealPlanApplyPreviewResponse(BaseModel):
    plan_id: int
    plan_name: str
    phase: str
    is_weekly: bool
    start_date: str
    end_date: str
    dates: list[str]
    total_existing_entries: int
    days: list[dict[str, Any]]


class ApplyMealPlanRequest(BaseModel):
    plan_id: int = Field(..., gt=0)
    date: str
    phase: str = "cut"
    apply_week: bool = False
    replace_existing: bool = False

    @field_validator("date")
    @classmethod
    def _date_ok(cls, value: str) -> str:
        return _normalize_food_date(value)

    @field_validator("phase")
    @classmethod
    def _phase_ok(cls, value: str) -> str:
        p = value.strip().lower()
        if p not in ALLOWED_FOOD_PHASES:
            raise ValueError("phase: cut или bulk")
        return p


class ApplyMealPlanMealResult(BaseModel):
    template_id: int
    template_name: str
    meal_type: str
    added: int


class ApplyMealPlanDayResult(BaseModel):
    date: str
    added: int


class ApplyMealPlanResponse(BaseModel):
    plan_id: int
    plan_name: str
    date: str
    phase: str
    apply_week: bool = False
    week_start: Optional[str] = None
    week_end: Optional[str] = None
    days_cleared: int = 0
    total_added: int
    meals: list[ApplyMealPlanMealResult] = []
    days: list[ApplyMealPlanDayResult] = []
    entries: list[FoodEntry]
    week_stats: Optional[FoodWeekResponse] = None


# ---------------------------------------------------------------------------
# Аналитика
# ---------------------------------------------------------------------------


class CaloriesAnalytics(BaseModel):
    """Калории за один день (силовые + кардио)."""

    date: str
    strength_kcal: float
    cardio_kcal: float
    total_kcal: float


# ---------------------------------------------------------------------------
# Обёртки списков (пагинация и ответы роутеров)
# ---------------------------------------------------------------------------


class PaginatedMeta(BaseModel):
    """Метаданные постраничной выборки."""

    total: int
    limit: int
    offset: int


class StrengthSessionsResponse(BaseModel):
    """GET /api/strength/sessions."""

    items: list[StrengthSession]
    meta: PaginatedMeta


class CardioWorkoutsResponse(BaseModel):
    """GET /api/cardio/workouts."""

    items: list[CardioWorkout]
    meta: PaginatedMeta


class BodyMetricsResponse(BaseModel):
    """GET /api/body/metrics."""

    items: list[dict[str, Any]]
    meta: PaginatedMeta


class CaloriesAnalyticsResponse(BaseModel):
    """GET /api/analytics/calories."""

    items: list[CaloriesAnalytics]


class WorkoutExpenditureDay(BaseModel):
    """Расход по тренировкам за день (часы / пульсометр / HR)."""

    date: str
    calories_watch_sum: int = 0
    calories_chest_sum: int = 0
    calories_hr_sum: int = 0


class WorkoutExpenditureResponse(BaseModel):
    """GET /api/analytics/workout-expenditure."""

    items: list[WorkoutExpenditureDay]


class FitSyncStats(BaseModel):
    """Статистика import_fit_folder / run_import."""

    files: int = 0
    imported: int = 0
    repaired: int = 0
    skipped: int = 0
    errors: int = 0
    files_seen: int = 0
    skipped_by_filename_date: int = 0
    parsed_files: int = 0
    imported_files: int = 0
    duplicates_skipped: int = 0


class FitSyncResponse(BaseModel):
    """POST /api/sync/fit?sync=true — синхронный импорт завершён."""

    status: str = "ok"
    message: str = ""
    stats: FitSyncStats
    folder: Optional[str] = None


class FitSyncStartedResponse(BaseModel):
    """POST /api/sync/fit — фоновый импорт запущен."""

    status: str = "started"
    task_id: str
    message: str = "Импорт FIT запущен в фоне"


class FitSyncTaskStatusResponse(BaseModel):
    """GET /api/sync/fit/status/{task_id} — прогресс фонового импорта."""

    task_id: str
    status: str  # running | completed | failed
    files_total: int = 0
    files_processed: int = 0
    imported: int = 0
    repaired: int = 0
    skipped: int = 0
    errors: int = 0
    files_seen: int = 0
    skipped_by_filename_date: int = 0
    parsed_files: int = 0
    imported_files: int = 0
    duplicates_skipped: int = 0
    folder: Optional[str] = None
    message: str = ""
    error: Optional[str] = None


# Обратная совместимость имён
SyncStartedResponse = FitSyncStartedResponse


class IntegrationSyncItem(BaseModel):
    """Результат одной интеграции."""

    id: str
    name: str
    status: str
    message: str
    folder: str | None = None
    stats: dict[str, Any] | None = None


class IntegrationsSyncResponse(BaseModel):
    """POST /api/sync/integrations."""

    status: str
    message: str
    items: list[IntegrationSyncItem]


class PolarConnectionStatus(BaseModel):
    """GET /api/polar/status — подключение Polar Flow для локального пользователя."""

    connected: bool = False
    local_user_id: int = 1
    polar_user_id: Optional[str] = None
    updated_at: Optional[str] = None
    expires_at: Optional[int] = None


class PolarSyncFetchResponse(BaseModel):
    """POST /api/sync/polar/fetch — новые тренировки в polar_pending_workouts."""

    status: str = "ok"
    new_count: int = 0
    message: str = ""


class OAuthProviderDebug(BaseModel):
    """OAuth-конфигурация одного провайдера (без секретов)."""

    configured: bool = False
    setup_required: bool = False
    oauth_flow_mode: Optional[str] = None
    secret_required: bool = True
    pkce_available: bool = False
    client_id_present: bool = False
    client_secret_present: bool = False
    client_id_preview: Optional[str] = None
    callback_path: str
    redirect_uri: Optional[str] = None
    redirect_source: str = "none"
    env_redirect_uri: Optional[str] = None
    auth_url_preview: Optional[str] = None
    legacy_redirect_ignored: bool = False


class OAuthDebugResponse(BaseModel):
    """GET /api/cloud/oauth-debug — диагностика redirect URI."""

    api_base_url: Optional[str] = None
    runtime_mode: str = "unknown"
    env_file_loaded: bool = False
    env_file_path: Optional[str] = None
    public_api_base_url: Optional[str] = None
    yandex: OAuthProviderDebug
    google: OAuthProviderDebug
    polar: OAuthProviderDebug
    alternate_redirect_uris: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PolarUploadResponse(BaseModel):
    """POST /api/sync/polar/upload — ручной импорт TCX/GPX/FIT."""

    status: str = "ok"
    message: str = ""
    polar_transaction_id: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None


class HealthConnectHubOverview(BaseModel):
    last_sync_at: Optional[str] = None
    device_label: Optional[str] = None
    sync_status: str = "no_data"
    imported_records: int = 0
    skipped_records: int = 0
    days_in_batch: int = 0
    saved_days_in_batch: int = 0
    permissions: dict[str, bool] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class HealthConnectHubStepsDay(BaseModel):
    date: str
    steps: int = 0
    source: Optional[str] = None


class HealthConnectHubSteps(BaseModel):
    has_data: bool = False
    today: Optional[int] = None
    today_source: Optional[str] = None
    week_series: list[HealthConnectHubStepsDay] = Field(default_factory=list)
    effective_source: Optional[str] = None
    date_range: dict[str, Optional[str]] = Field(default_factory=dict)
    source_breakdown: list[dict[str, Any]] = Field(default_factory=list)
    source_breakdown_note: Optional[str] = None
    stale: bool = False
    stale_reason: Optional[str] = None


class HealthConnectHubSleepNight(BaseModel):
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_hours: float = 0
    source: Optional[str] = None


class HealthConnectHubLastNight(BaseModel):
    date: Optional[str] = None
    hours: Optional[float] = None
    source: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class HealthConnectHubSleep(BaseModel):
    has_data: bool = False
    last_night: HealthConnectHubLastNight = Field(default_factory=HealthConnectHubLastNight)
    avg_hours: Optional[float] = None
    consistency_score: Optional[float] = None
    week_nights: list[HealthConnectHubSleepNight] = Field(default_factory=list)
    freshness: str = "no_data"
    stale_warning: Optional[str] = None


class HealthConnectHubCaloriesDay(BaseModel):
    date: str
    total_calories: int = 0
    source: Optional[str] = None


class HealthConnectHubCaloriesSection(BaseModel):
    label: str
    source: str
    description: str


class HealthConnectHubCalories(BaseModel):
    has_data: bool = False
    today_total: Optional[int] = None
    today_active: Optional[int] = None
    today_source: Optional[str] = None
    week_series: list[HealthConnectHubCaloriesDay] = Field(default_factory=list)
    sections: dict[str, HealthConnectHubCaloriesSection] = Field(default_factory=dict)
    routing_notes: list[str] = Field(default_factory=list)


class HealthConnectHubWorkoutItem(BaseModel):
    id: int
    date: str
    type: str
    duration_sec: int = 0
    calories: Optional[int] = None
    source: Optional[str] = None
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    link_status: str = "standalone"
    linked_source: Optional[str] = None


class HealthConnectHubWorkouts(BaseModel):
    has_data: bool = False
    items: list[HealthConnectHubWorkoutItem] = Field(default_factory=list)
    linked_count: int = 0
    standalone_count: int = 0


class HealthConnectHubHeartRate(BaseModel):
    has_data: bool = False
    resting_hr_estimate: Optional[int] = None
    daily_hr_min: Optional[int] = None
    daily_hr_max: Optional[int] = None
    sample_count: int = 0
    source: Optional[str] = None
    incomplete_warning: Optional[str] = None
    hr_skipped_count: int = 0


class HealthConnectRoutingRule(BaseModel):
    metric: str
    metric_label: str
    effective: str
    policy: str
    fallback: Optional[str] = None


class HealthConnectHubSourceRouting(BaseModel):
    rules: list[HealthConnectRoutingRule] = Field(default_factory=list)


class HealthConnectHubResponse(BaseModel):
    """GET /api/sync/health-connect/hub — desktop data hub."""

    overview: HealthConnectHubOverview
    steps: HealthConnectHubSteps
    sleep: HealthConnectHubSleep
    calories: HealthConnectHubCalories
    workouts: HealthConnectHubWorkouts
    heart_rate: HealthConnectHubHeartRate
    source_routing: HealthConnectHubSourceRouting
    analytics_connected: bool = False
    debug_available: bool = True


class DashboardHcStatusSnapshot(BaseModel):
    """Lightweight HC row on home dashboard (no full hub)."""

    last_sync_at: Optional[str] = None
    sync_status: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    steps_today: Optional[int] = None
    steps_today_source: Optional[str] = None
    stale: bool = False


class DashboardCloudStatus(BaseModel):
    connected: bool = False
    expires_at: Optional[str] = None
    account_email: Optional[str] = None
    account_name: Optional[str] = None
    account_label: Optional[str] = None


class DashboardFormaSyncStatus(BaseModel):
    yandex_connected: bool
    yandex_uid: Optional[str] = None
    local_revision: int = 0
    remote_revision: Optional[int] = None
    pending_changes: int = 0
    conflict_count: int = 0
    last_upload_at: Optional[str] = None
    last_download_at: Optional[str] = None
    last_error: Optional[str] = None
    sync_in_flight: bool = False
    auto_enabled: bool = False
    baseline_required: bool = False
    debug_plan: Optional[dict[str, Any]] = None


class DashboardSyncStatusBlock(BaseModel):
    polar: PolarConnectionStatus
    cloud: DashboardCloudStatus
    forma_sync: DashboardFormaSyncStatus
    health_connect: DashboardHcStatusSnapshot


class DashboardWeightWeekPoint(BaseModel):
    date: str
    weight_kg: float


class DashboardWeightWeekResponse(BaseModel):
    items: list[DashboardWeightWeekPoint] = Field(default_factory=list)


class DashboardHomeResponse(BaseModel):
    """GET /api/dashboard/home."""

    date: str
    phase: str = "cut"
    ctl: CtlAtlTsbResponse
    food: FoodDayResponse
    body: dict[str, Any]
    steps_today: StepsHistoryResponse
    steps_week: StepsHistoryResponse
    weight_week: DashboardWeightWeekResponse = Field(default_factory=DashboardWeightWeekResponse)
    sleep: dict[str, Any]
    latest_strength: StrengthSessionsResponse
    sync: DashboardSyncStatusBlock
    health_connect_hub: Optional[HealthConnectHubResponse] = None


class PolarPendingWorkout(BaseModel):
    """GET /api/polar/pending/{date}?type=…"""

    id: int
    polar_transaction_id: str
    date: Optional[str] = None
    type: Optional[str] = None
    duration_sec: Optional[int] = None
    distance_km: Optional[float] = None
    calories: Optional[int] = None
    avg_hr: Optional[int] = None
    max_hr: Optional[int] = None
    imported: int = 0


class PolarPendingListItem(BaseModel):
    """Элемент GET /api/polar/pending/list."""

    polar_transaction_id: str
    date: Optional[str] = None
    type: Optional[str] = None
    distance_km: Optional[float] = None
    duration_sec: Optional[int] = None
    calories: Optional[int] = None
    is_manual_upload: bool = False


class PolarPendingListResponse(BaseModel):
    items: list[PolarPendingListItem] = Field(default_factory=list)
    total: int = 0


class PolarAttachBody(BaseModel):
    polar_transaction_id: str = Field(..., min_length=1)


class PolarAttachResponse(BaseModel):
    message: str
    hr_samples: int = 0
    has_hr_chart: bool = False
    gps_saved: bool = False
    fields_updated: bool = False
    hr_samples_received: int = 0
    hr_samples_parsed: int = 0
    hr_samples_inserted: int = 0
    hr_parser_source: Optional[str] = None
    scalar_fields_updated: bool = False
    warnings: list[str] = Field(default_factory=list)


class CardioWorkoutCreateResponse(BaseModel):
    id: int
    message: str = "ok"


# ---------------------------------------------------------------------------
# Псевдонимы (обратная совместимость имён в коде)
# ---------------------------------------------------------------------------

StrengthSessionSummary = StrengthSession
CaloriesAnalyticsRow = CaloriesAnalytics
DailyCaloriesRow = CaloriesAnalytics
DailyCaloriesResponse = CaloriesAnalyticsResponse
CardioWorkoutRow = CardioWorkout
BodyMetricRow = BodyMetric
