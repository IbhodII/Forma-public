import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchMenstrualCycleSettings,
  saveMenstrualCycleSettings,
} from "../../../api/menstrualCycle";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { useCycleFeatureEnabled } from "../../../hooks/useCycleFeatureEnabled";
import { parseApiError } from "../../../utils/validation";

export function CycleHealthSettings({ embedded = false }: { embedded?: boolean }) {
  const cycleFeatureEnabled = useCycleFeatureEnabled();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [cycleLength, setCycleLength] = useState("28");
  const [periodLength, setPeriodLength] = useState("5");
  const [lastPeriodStart, setLastPeriodStart] = useState("");
  const [cycleEnabled, setCycleEnabled] = useState(true);

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.menstrualCycleSettings,
    queryFn: fetchMenstrualCycleSettings,
    enabled: cycleFeatureEnabled,
  });

  useEffect(() => {
    if (!settings) return;
    setCycleLength(String(settings.cycle_length_days));
    setPeriodLength(String(settings.period_length_days));
    setLastPeriodStart(settings.last_period_start ?? settings.last_menstruation ?? "");
    setCycleEnabled(settings.cycle_enabled !== false);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveMenstrualCycleSettings({
        cycle_length_days: Number(cycleLength),
        period_length_days: Number(periodLength),
        last_period_start: lastPeriodStart || null,
        cycle_enabled: cycleEnabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.menstrualCycleSettings });
      void qc.invalidateQueries({ queryKey: ["menstrual-cycle"] });
      void qc.invalidateQueries({ queryKey: queryKeys.menstrualCycleImpact() });
      showToast("Настройки цикла сохранены", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  if (!cycleFeatureEnabled) {
    return null;
  }

  if (isLoading) return <Loader label="Настройки цикла…" />;

  return (
    <div className={embedded ? "space-y-4" : "card-panel space-y-4"}>
      {!embedded && (
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Женское здоровье
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Фазы влияют на BMR в дневнике питания и на расчёт CTL/ATL/TSB.
          </p>
        </div>
      )}

      <label className="flex items-center gap-3 text-sm cursor-pointer min-h-11">
        <input
          type="checkbox"
          checked={cycleEnabled}
          onChange={(e) => setCycleEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-slate-300"
        />
        Учитывать фазу цикла в расчётах (BMR и нагрузка)
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          Дата последней менструации
          <input
            type="date"
            value={lastPeriodStart}
            onChange={(e) => setLastPeriodStart(e.target.value)}
            className="input-field mt-1 w-full min-h-11"
          />
        </label>
        <label className="block text-sm">
          Средняя длина цикла (дней)
          <input
            type="number"
            min={15}
            max={60}
            value={cycleLength}
            onChange={(e) => setCycleLength(e.target.value)}
            className="input-field mt-1 w-full min-h-11"
          />
        </label>
        <label className="block text-sm">
          Длительность менструации (дней)
          <input
            type="number"
            min={1}
            max={14}
            value={periodLength}
            onChange={(e) => setPeriodLength(e.target.value)}
            className="input-field mt-1 w-full min-h-11"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          className="btn-primary min-h-11"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Сохранение…" : "Сохранить"}
        </button>
        <Link to="/cycle" className="text-sm text-brand-600 font-medium min-h-11 inline-flex items-center">
          Открыть календарь цикла →
        </Link>
      </div>
    </div>
  );
}
