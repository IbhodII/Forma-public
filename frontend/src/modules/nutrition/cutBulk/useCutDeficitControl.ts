import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchCutDeficitControl } from "../../../api/cutBulk";
import { fetchUserProfile, saveUserProfile } from "../../../api/user";
import { queryKeys } from "../../../hooks/queryKeys";
import { useToast } from "../../../components/Toast";
import { loadPreferChestWorkoutKcal } from "../../../pages/FoodDiary/workoutExpenditure";
import { parseApiError } from "../../../utils/validation";

const DEFAULT_MAX_DEFICIT = 35;
const MIN_MAX_DEFICIT = 5;
const MAX_MAX_DEFICIT = 70;

export function useCutDeficitControl(preferChestProp?: boolean) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [maxDeficit, setMaxDeficit] = useState(DEFAULT_MAX_DEFICIT);
  const preferChest = preferChestProp ?? loadPreferChestWorkoutKcal();

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  useEffect(() => {
    const v = profileQuery.data?.max_deficit_per_kg_fat;
    if (v != null) setMaxDeficit(Number(v));
  }, [profileQuery.data?.max_deficit_per_kg_fat]);

  const controlQuery = useQuery({
    queryKey: queryKeys.cutDeficitControl(preferChest, maxDeficit),
    queryFn: () => fetchCutDeficitControl(preferChest, maxDeficit),
  });

  const saveMut = useMutation({
    mutationFn: (value: number) => saveUserProfile({ max_deficit_per_kg_fat: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.userProfile });
      void qc.invalidateQueries({ queryKey: ["nutrition", "deficit-control"] });
      showToast("Целевой лимит дефицита сохранён", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const persistLimit = () => {
    if (!Number.isFinite(maxDeficit) || maxDeficit < MIN_MAX_DEFICIT || maxDeficit > MAX_MAX_DEFICIT) {
      showToast("Лимит дефицита должен быть от 5 до 70 ккал/кг жира", "error");
      return;
    }
    saveMut.mutate(maxDeficit);
  };

  const data = controlQuery.data;
  const realPerKg = data?.real_deficit_per_kg_fat ?? data?.deficit_per_kg_fat;
  const realKcal = data?.real_deficit_kcal ?? data?.average_daily_deficit_kcal;

  return {
    maxDeficit,
    setMaxDeficit,
    minMaxDeficit: MIN_MAX_DEFICIT,
    maxMaxDeficit: MAX_MAX_DEFICIT,
    persistLimit,
    savePending: saveMut.isPending,
    controlQuery,
    data,
    realPerKg,
    realKcal,
  };
}
