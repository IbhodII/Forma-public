import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCutBulkPlan,
  fetchForecastReadiness,
  forecastDynamicCut,
  forecastNutrition,
  saveCutBulkPlan,
  type CutBulkSnapshot,
  type NutritionForecastResult,
  type NutritionPlan,
} from "../../api/cutBulk";
import type { FoodPhase } from "../../api/food";
import { fetchUserProfile } from "../../api/user";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import {
  defaultTargetBodyFatPercent,
  hasBodyFatInSnapshot,
  resolveTargetBodyFatForApi,
  validateCutGoalLeanMass,
  validateTargetBodyFat,
} from "../../modules/nutrition/cutBulk/bodyFatGoal";
import { parseApiError } from "../../utils/validation";
import { CUT_BALANCE_PERIOD } from "../../modules/nutrition/cutBulk/balancePeriod";

const FORECAST_DEBOUNCE_MS = 500;

type ForecastParams = {
  phase: FoodPhase;
  targetWeight: number;
  targetBf: string;
  useTargetBf: boolean;
  preferChest: boolean;
  bulkGramsPerWeek: number;
  useDynamicCut: boolean;
  targetBfRequired: boolean;
};

async function runForecastRequest(params: ForecastParams): Promise<NutritionForecastResult> {
  const targetBodyFat = resolveTargetBodyFatForApi(
    params.targetBf,
    params.useTargetBf,
    params.targetBfRequired,
  );
  if (params.useDynamicCut) {
    return forecastDynamicCut({
      target_weight_kg: params.targetWeight,
      target_body_fat_percent: targetBodyFat,
      prefer_chest_workout: params.preferChest,
      balance_period: CUT_BALANCE_PERIOD,
      persist_plan: true,
    });
  }
  return forecastNutrition({
    phase: params.phase,
    target_weight_kg: params.targetWeight,
    target_body_fat_percent: targetBodyFat,
    prefer_chest_workout: params.preferChest,
    target_bulk_grams_per_week: params.phase === "bulk" ? params.bulkGramsPerWeek : undefined,
    balance_period: CUT_BALANCE_PERIOD,
    persist_plan: true,
  });
}

export function useNutritionGoalProjection(
  phase: FoodPhase,
  snap: CutBulkSnapshot | null,
  preferChest: boolean,
) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const weight = snap?.weight_kg ?? null;
  const bf = snap?.body_fat_percent ?? null;
  const targetBfRequired = hasBodyFatInSnapshot(snap);

  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [targetBf, setTargetBf] = useState<string>("");
  const [useTargetBf, setUseTargetBf] = useState(false);
  const [bulkGramsPerWeek, setBulkGramsPerWeek] = useState(300);
  const [goalsReady, setGoalsReady] = useState(false);
  const [initializedPhase, setInitializedPhase] = useState<FoodPhase | null>(null);
  const [debouncedParams, setDebouncedParams] = useState<ForecastParams | null>(null);
  const lastAutoKey = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  const planQuery = useQuery({
    queryKey: queryKeys.cutBulkPlan(phase),
    queryFn: () => fetchCutBulkPlan(phase),
  });

  const readinessQuery = useQuery({
    queryKey: queryKeys.forecastReadiness(phase),
    queryFn: () => fetchForecastReadiness(phase),
    refetchOnWindowFocus: false,
  });

  const forecastMut = useMutation({
    mutationFn: runForecastRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.cutBulkPlan(phase) });
    },
  });

  useEffect(() => {
    const v = profileQuery.data?.target_bulk_grams_per_week;
    if (v != null) setBulkGramsPerWeek(Number(v));
  }, [profileQuery.data?.target_bulk_grams_per_week]);

  useEffect(() => {
    if (weight == null) {
      setGoalsReady(false);
      return;
    }
    if (planQuery.isLoading || initializedPhase === phase) return;

    const plan = planQuery.data;
    const defaultTarget =
      phase === "cut" ? Math.round((weight - 5) * 10) / 10 : Math.round((weight + 5) * 10) / 10;

    const nextWeight =
      plan?.target_weight_kg != null ? Number(plan.target_weight_kg) : defaultTarget;
    setTargetWeight(nextWeight);

    if (targetBfRequired && bf != null) {
      setUseTargetBf(true);
      setTargetBf(
        plan?.target_fat_percent != null
          ? String(plan.target_fat_percent)
          : String(defaultTargetBodyFatPercent(bf, phase)),
      );
    } else if (plan?.target_fat_percent != null) {
      setUseTargetBf(true);
      setTargetBf(String(plan.target_fat_percent));
    } else {
      setUseTargetBf(false);
      setTargetBf("");
    }
    setInitializedPhase(phase);
    setGoalsReady(true);
  }, [phase, weight, planQuery.data, planQuery.isLoading, initializedPhase, targetBfRequired, bf]);

  const useDynamicCut = phase === "cut" && targetBfRequired && bf != null;

  const liveParams = useMemo((): ForecastParams | null => {
    if (!goalsReady || targetWeight == null) return null;
    return {
      phase,
      targetWeight,
      targetBf,
      useTargetBf: targetBfRequired || useTargetBf,
      preferChest,
      bulkGramsPerWeek,
      useDynamicCut,
      targetBfRequired,
    };
  }, [
    goalsReady,
    targetWeight,
    phase,
    targetBf,
    useTargetBf,
    targetBfRequired,
    preferChest,
    bulkGramsPerWeek,
    useDynamicCut,
  ]);

  useEffect(() => {
    if (!liveParams) {
      setDebouncedParams(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedParams(liveParams), FORECAST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [liveParams]);

  const targetBfValidation = useMemo(() => {
    if (!targetBfRequired || bf == null) {
      return { valid: true, message: null as string | null };
    }
    return validateTargetBodyFat(targetBf, bf, phase, true);
  }, [targetBf, bf, phase, targetBfRequired]);

  const cutGoalValidation = useMemo(() => {
    if (phase !== "cut" || weight == null || bf == null || targetWeight == null) {
      return { valid: true, message: null as string | null };
    }
    if (!targetBfValidation.valid) return { valid: true, message: null };
    const targetBfPct = resolveTargetBodyFatForApi(targetBf, useTargetBf, targetBfRequired);
    return validateCutGoalLeanMass(weight, bf, targetWeight, targetBfPct);
  }, [
    phase,
    weight,
    bf,
    targetWeight,
    targetBf,
    useTargetBf,
    targetBfRequired,
    targetBfValidation.valid,
  ]);

  const forecastBlockedReason = useMemo((): string | null => {
    if (!goalsReady || weight == null || targetWeight == null) return null;
    if (!targetBfValidation.valid) return targetBfValidation.message;
    if (!cutGoalValidation.valid) return cutGoalValidation.message;
    if (readinessQuery.isLoading) return null;
    if (readinessQuery.data && !readinessQuery.data.ok) {
      return (
        readinessQuery.data.message ??
        "Нужны данные за 2 заполненные недели питания для прогноза."
      );
    }
    if (phase === "cut" && !useDynamicCut && targetWeight >= weight) {
      return "При сушке целевой вес должен быть ниже текущего.";
    }
    if (phase === "bulk" && targetWeight <= weight) {
      return "При наборе целевой вес должен быть выше текущего.";
    }
    return null;
  }, [
    goalsReady,
    weight,
    targetWeight,
    targetBfValidation,
    cutGoalValidation,
    readinessQuery.isLoading,
    readinessQuery.data,
    phase,
    useDynamicCut,
  ]);

  const canAutoForecast = debouncedParams != null && forecastBlockedReason == null;

  const forecastParamKey = useMemo(() => {
    if (!debouncedParams) return null;
    const p = debouncedParams;
    return [
      p.phase,
      p.targetWeight,
      p.useTargetBf ? p.targetBf : "",
      p.preferChest ? 1 : 0,
      p.bulkGramsPerWeek,
      p.useDynamicCut ? "dynamic" : "linear",
      CUT_BALANCE_PERIOD,
    ].join("|");
  }, [debouncedParams]);

  useEffect(() => {
    if (!canAutoForecast || !debouncedParams || !forecastParamKey) return;
    if (lastAutoKey.current === forecastParamKey && forecastMut.data) return;
    lastAutoKey.current = forecastParamKey;
    forecastMut.mutate(debouncedParams);
  }, [canAutoForecast, debouncedParams, forecastParamKey, forecastMut.mutate]);

  const saveGoalsMut = useMutation({
    mutationFn: (body: {
      target_weight_kg: number;
      target_fat_percent?: number;
      gain_rate_kg_per_week?: number;
    }) =>
      saveCutBulkPlan({
        phase,
        target_weight_kg: body.target_weight_kg,
        target_fat_percent: body.target_fat_percent,
        gain_rate_kg_per_week: body.gain_rate_kg_per_week,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.cutBulkPlan(phase) });
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const scheduleSaveGoals = useCallback(
    (tw: number, bfVal: string, useBf: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const fatPct = resolveTargetBodyFatForApi(bfVal, useBf, targetBfRequired);
        if (targetBfRequired && fatPct == null) return;

        const payload: {
          target_weight_kg: number;
          target_fat_percent?: number;
          gain_rate_kg_per_week?: number;
        } = { target_weight_kg: tw };
        if (fatPct != null) payload.target_fat_percent = fatPct;
        if (phase === "bulk") {
          payload.gain_rate_kg_per_week = Math.round((bulkGramsPerWeek / 1000) * 100) / 100;
        }
        saveGoalsMut.mutate(payload);
      }, 600);
    },
    [phase, bulkGramsPerWeek, saveGoalsMut, targetBfRequired],
  );

  const forecast: NutritionForecastResult | null = forecastMut.data ?? null;
  const savedPlan: NutritionPlan | undefined = planQuery.data;

  const periodLabel = useMemo(() => {
    if (!forecast?.balance_from || !forecast?.balance_to) {
      return "прошлая неделя";
    }
    return `${forecast.balance_from} — ${forecast.balance_to}`;
  }, [forecast?.balance_from, forecast?.balance_to]);

  const forecastWaitingDebounce =
    liveParams != null &&
    debouncedParams == null &&
    forecastBlockedReason == null &&
    !forecastMut.isPending;

  const forecastLoading = forecastMut.isPending || forecastWaitingDebounce;

  const refetchForecast = useCallback(() => {
    if (!liveParams) return;
    if (forecastBlockedReason) return;
    lastAutoKey.current = null;
    forecastMut.mutate(liveParams);
  }, [liveParams, forecastBlockedReason, forecastMut]);

  const updateTargetWeight = (v: number) => {
    setTargetWeight(v);
    scheduleSaveGoals(v, targetBf, useTargetBf);
  };

  const updateTargetBf = (v: string, useBf: boolean) => {
    const effectiveUseBf = targetBfRequired || useBf;
    setTargetBf(v);
    setUseTargetBf(effectiveUseBf);
    if (targetWeight != null) scheduleSaveGoals(targetWeight, v, effectiveUseBf);
  };

  return {
    weight,
    bf,
    targetBfRequired,
    targetBfValidation,
    cutGoalValidation,
    forecastBlockedReason,
    targetWeight,
    setTargetWeight: updateTargetWeight,
    targetBf,
    setTargetBf: (v: string) => updateTargetBf(v, useTargetBf),
    useTargetBf,
    setUseTargetBf: (on: boolean) => {
      if (targetBfRequired) return;
      updateTargetBf(targetBf, on);
    },
    bulkGramsPerWeek,
    setBulkGramsPerWeek,
    forecast,
    forecastError: forecastMut.error,
    forecastLoading,
    forecastEnabled: canAutoForecast,
    forecastReadiness: readinessQuery.data ?? null,
    forecastReadinessLoading: readinessQuery.isLoading,
    savedPlan,
    planLoading: planQuery.isLoading,
    periodLabel,
    refetchForecast,
    saveGoalsPending: saveGoalsMut.isPending,
  };
}
