import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  fetchDailyBraceletCalories,
  saveDailyBraceletCalories,
} from "../../api/analytics";
import { fetchUserProfile, saveUserProfile } from "../../api/user";
import { queryKeys } from "../../hooks/queryKeys";
import {
  loadPreferChestWorkoutKcal,
  savePreferChestWorkoutKcal,
} from "./workoutExpenditure";

export function BraceletCaloriesPanel({
  date,
  onBraceletChange,
  onPreferChestChange,
}: {
  date: string;
  onBraceletChange: (kcal: number | null) => void;
  onPreferChestChange: (prefer: boolean) => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [preferChest, setPreferChest] = useState(() => loadPreferChestWorkoutKcal());

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  useEffect(() => {
    const v = profileQuery.data?.use_chest_strap_priority;
    if (v != null) {
      setPreferChest(v);
      savePreferChestWorkoutKcal(v);
      onPreferChestChange(v);
    }
  }, [profileQuery.data?.use_chest_strap_priority, onPreferChestChange]);

  const { data: rows } = useQuery({
    queryKey: queryKeys.dailyBraceletCalories(date, date),
    queryFn: () => fetchDailyBraceletCalories(date, date),
  });

  const saved = rows?.find((r) => r.date.slice(0, 10) === date.slice(0, 10));

  useEffect(() => {
    onPreferChestChange(preferChest);
  }, [preferChest, onPreferChestChange]);

  useEffect(() => {
    if (saved?.total_calories != null) {
      setInput(String(saved.total_calories));
      onBraceletChange(saved.total_calories);
    } else {
      setInput("");
      onBraceletChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when date / server row changes
  }, [date, saved?.total_calories]);

  const saveMut = useMutation({
    mutationFn: (total: number) =>
      saveDailyBraceletCalories({ date: date.slice(0, 10), total_calories: total }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.dailyBraceletCalories(date, date) });
      void qc.invalidateQueries({ queryKey: ["analytics", "daily-expenditure"] });
      void qc.invalidateQueries({ queryKey: ["analytics", "daily-expenditure-week"] });
    },
  });

  const savePreferMut = useMutation({
    mutationFn: (value: boolean) => saveUserProfile({ use_chest_strap_priority: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.userProfile });
    },
  });

  const commitValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onBraceletChange(null);
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onBraceletChange(n);
    if (saved?.total_calories !== n) {
      saveMut.mutate(n);
    }
  };

  return (
    <div className="card-panel space-y-3">
      <h3 className="font-medium text-sm">Калории по браслету</h3>
      <label className="text-sm block">
        Калории по браслету (за день)
        <input
          type="number"
          min={0}
          step={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            commitValue(e.target.value);
          }}
          onBlur={() => commitValue(input)}
          className="input-field mt-1 max-w-xs"
          placeholder="например 2450"
        />
      </label>
      <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed">
        Если указать калории по браслету, программа заменит калории тренировок с часов на данные с
        пульсометра (при отсутствии пульсометра — данные с часов).
      </p>
      <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={preferChest}
          onChange={(e) => {
            const v = e.target.checked;
            setPreferChest(v);
            savePreferChestWorkoutKcal(v);
            onPreferChestChange(v);
            savePreferMut.mutate(v);
          }}
          className="rounded border-slate-300"
        />
        Использовать приоритет пульсометра
      </label>
      {saveMut.isPending && (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">Сохранение…</p>
      )}
    </div>
  );
}
