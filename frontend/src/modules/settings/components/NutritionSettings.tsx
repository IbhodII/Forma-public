import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  calculateUserLevel,
  fetchBraceletCalibration,
  fetchNutritionSettings,
  recalculateBraceletCalibration,
  saveNutritionSettings,
  type ActivityLevel,
  type LevelRecommendations,
} from "../../../api/user";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { CollapsibleSection } from "./CollapsibleSection";
import { LevelRecommendationsModal } from "./LevelRecommendationsModal";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  {
    value: "sedentary",
    label: "Сидячий / обычный",
    hint: "Мало движения, без регулярных тренировок",
  },
  {
    value: "active",
    label: "Активный образ жизни / спортсмен",
    hint: "Регулярные кардио или силовые нагрузки",
  },
];

export function NutritionSettings({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.nutritionSettings,
    queryFn: fetchNutritionSettings,
  });
  const {
    data: calibration,
    isLoading: calibrationLoading,
    refetch: refetchCalibration,
  } = useQuery({
    queryKey: queryKeys.braceletCalibration,
    queryFn: fetchBraceletCalibration,
  });

  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("sedentary");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [useCustomProtein, setUseCustomProtein] = useState(false);
  const [useCustomFat, setUseCustomFat] = useState(false);
  const [useCustomCarbs, setUseCustomCarbs] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<LevelRecommendations | null>(null);
  const [recHints, setRecHints] = useState<string[]>([]);
  const [showRecModal, setShowRecModal] = useState(false);

  useEffect(() => {
    if (!data) return;
    setActivityLevel(data.activity_level === "active" ? "active" : "sedentary");
    setUseCustomProtein(data.protein_gram_per_kg != null);
    setUseCustomFat(data.fat_gram_per_kg != null);
    setUseCustomCarbs(data.carbs_gram_per_kg != null);
    setProtein(data.protein_gram_per_kg != null ? String(data.protein_gram_per_kg) : "");
    setFat(data.fat_gram_per_kg != null ? String(data.fat_gram_per_kg) : "");
    setCarbs(data.carbs_gram_per_kg != null ? String(data.carbs_gram_per_kg) : "");
  }, [data]);

  const saveMut = useMutation({
    mutationFn: saveNutritionSettings,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.nutritionSettings });
      showToast("Нормы питания сохранены", "success");
      setFormError(null);
    },
    onError: (e) => setFormError(parseApiError(e)),
  });

  const recalibrateMut = useMutation({
    mutationFn: () => recalculateBraceletCalibration(14, "cut"),
    onSuccess: (res) => {
      void refetchCalibration();
      void qc.invalidateQueries({ queryKey: ["analytics", "daily-expenditure"] });
      void qc.invalidateQueries({ queryKey: ["analytics", "daily-expenditure-week"] });
      const deficitSummary =
        res.predicted_deficit_kcal != null && res.observed_deficit_kcal != null
          ? ` · прогноз ${Math.round(res.predicted_deficit_kcal)} ккал, факт ${Math.round(
              res.observed_deficit_kcal,
            )} ккал`
          : "";
      showToast(
        `Коэффициент обновлён: ${res.old_factor.toFixed(2)} → ${res.new_factor.toFixed(
          2,
        )}${deficitSummary}`,
        "success",
      );
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const calcMut = useMutation({
    mutationFn: calculateUserLevel,
    onSuccess: (res) => {
      setCalcError(null);
      if (res.status === "missing_data") {
        const message =
          res.missing_hints.length > 0
            ? res.missing_hints.join(". ")
            : "Недостаточно данных для расчёта";
        setCalcError(message);
        setRecommendations(null);
        setRecHints([]);
        setShowRecModal(false);
        showToast(message, "error");
        return;
      }
      if (res.recommendations) {
        setRecommendations(res.recommendations);
        setRecHints(res.missing_hints ?? []);
        setShowRecModal(true);
      }
    },
    onError: (e) => {
      const msg = parseApiError(e);
      setCalcError(msg);
      showToast(msg, "error");
    },
  });

  const parseOptional = (s: string, enabled: boolean): number | null => {
    if (!enabled || !s.trim()) return null;
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMut.mutate({
      activity_level: activityLevel,
      protein_gram_per_kg: parseOptional(protein, useCustomProtein),
      fat_gram_per_kg: parseOptional(fat, useCustomFat),
      carbs_gram_per_kg: parseOptional(carbs, useCustomCarbs),
    });
  };

  const applyRecommendations = () => {
    if (!recommendations) return;
    const payload = {
      activity_level: recommendations.activity_level,
      protein_gram_per_kg: recommendations.protein_grams_per_kg,
      fat_gram_per_kg: recommendations.fat_grams_per_kg,
      carbs_gram_per_kg: recommendations.carbs_grams_per_kg,
    };
    setActivityLevel(recommendations.activity_level);
    setUseCustomProtein(true);
    setUseCustomFat(true);
    setUseCustomCarbs(true);
    setProtein(String(recommendations.protein_grams_per_kg));
    setFat(String(recommendations.fat_grams_per_kg));
    setCarbs(String(recommendations.carbs_grams_per_kg));
    saveMut.mutate(payload, {
      onSuccess: () => {
        setShowRecModal(false);
        setRecommendations(null);
        setRecHints([]);
        showToast("Рекомендации применены и сохранены", "success");
      },
    });
  };

  const missingLinks = calcError && (
    <p className="text-xs mt-2 flex flex-wrap gap-x-3 gap-y-1">
      <Link to="/settings?tab=profile" className="text-brand-600 underline">
        Профиль (рост, возраст, пол)
      </Link>
      <Link to="/body" className="text-brand-600 underline">
        Тело (вес, % жира)
      </Link>
      <Link to="/workouts" className="text-brand-600 underline">
        Тренировки
      </Link>
    </p>
  );

  if (isLoading) return <Loader label="Загрузка настроек питания…" />;

  return (
    <>
      <CollapsibleSection
        title="Целевые нормы питания"
        description="Белки, жиры и углеводы на кг массы тела; уровень активности для рекомендаций"
        defaultOpen={false}
        embedded={embedded}
      >
        {formError && <ErrorAlert message={formError} />}
        {calcError && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {calcError}
            {missingLinks}
          </div>
        )}
        {calcMut.isPending && <Loader label="Расчёт уровня…" />}
        <form onSubmit={handleSave} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Уровень активности
            </legend>
            <div className="space-y-2">
              {ACTIVITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                >
                  <input
                    type="radio"
                    name="activity_level"
                    value={opt.value}
                    checked={activityLevel === opt.value}
                    onChange={() => setActivityLevel(opt.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{opt.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-3 gap-3">
            <MacroField
              label="Белки, г/кг"
              value={protein}
              onChange={setProtein}
              enabled={useCustomProtein}
              onToggle={setUseCustomProtein}
              placeholder={activityLevel === "active" ? "1.6" : "1.2"}
            />
            <MacroField
              label="Жиры, г/кг"
              value={fat}
              onChange={setFat}
              enabled={useCustomFat}
              onToggle={setUseCustomFat}
              placeholder="0.8"
            />
            <MacroField
              label="Углеводы, г/кг"
              value={carbs}
              onChange={setCarbs}
              enabled={useCustomCarbs}
              onToggle={setUseCustomCarbs}
              placeholder="3.5"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Оставьте поле пустым (снимите галочку), чтобы использовать рекомендации по уровню
            активности.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary"
              disabled={calcMut.isPending}
              onClick={() => calcMut.mutate()}
            >
              {calcMut.isPending ? "Расчёт…" : "Рассчитать уровень"}
            </button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary">
              {saveMut.isPending ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      </CollapsibleSection>

      <CollapsibleSection
        title="Калибровка калорий браслета"
        description="Коррекция завышенного расхода с часов по динамике веса и дневнику питания (фаза «сушка»)"
        defaultOpen={false}
        embedded={embedded}
      >
        {calibrationLoading ? (
          <Loader label="Загрузка…" />
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700 dark:text-slate-200">
              Коэффициент калибровки (часы):{" "}
              <span className="font-semibold tabular-nums">
                {(calibration?.factor ?? 1).toFixed(2)}
              </span>
              {calibration?.last_calibration_date && (
                <span className="text-slate-500 dark:text-slate-400 text-xs ml-2">
                  (пересчёт {calibration.last_calibration_date})
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Сначала сохраняется правило замены тренировок: калории Polar/пульсометра имеют
              приоритет над часами. Затем коэффициент применяется к итоговой activity-части расхода.
              Ниже 1.0 — прогноз завышает расход; выше 1.0 — занижает. Нужны ≥5 замеров веса,
              дневник и калории браслета за период.
            </p>
            {calibration?.calibration_stale && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Прошло более 14 дней с последнего пересчёта — имеет смысл обновить коэффициент.
              </p>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={recalibrateMut.isPending}
              onClick={() => recalibrateMut.mutate()}
            >
              {recalibrateMut.isPending
                ? "Пересчёт…"
                : "Пересчитать за последние 14 дней"}
            </button>
          </div>
        )}
      </CollapsibleSection>

      {showRecModal && recommendations && (
        <LevelRecommendationsModal
          recommendations={recommendations}
          hints={recHints}
          applying={saveMut.isPending}
          onClose={() => setShowRecModal(false)}
          onApply={applyRecommendations}
        />
      )}
    </>
  );
}

function MacroField({
  label,
  value,
  onChange,
  enabled,
  onToggle,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  placeholder: string;
}) {
  return (
    <label className="text-sm block space-y-1">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        disabled={!enabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input-field mt-1 disabled:opacity-50"
      />
    </label>
  );
}
