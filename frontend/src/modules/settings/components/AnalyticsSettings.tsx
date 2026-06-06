import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_HC_ANALYTICS_PREFS,
  fetchAnalyticsSettings,
  saveAnalyticsSettings,
  type HcAnalyticsPrefs,
  HC_ANALYTICS_METRIC_KEYS,
} from "../../../api/user";
import { HcAnalyticsMasterToggle } from "../../../components/HcAnalyticsMasterToggle";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { CollapsibleSection } from "./CollapsibleSection";

const HC_TOGGLES: {
  key: (typeof HC_ANALYTICS_METRIC_KEYS)[number];
  title: string;
  description: string;
}[] = [
  {
    key: "steps",
    title: "Шаги",
    description: "Ежедневные шаги из Health Connect в домашней и телесной аналитике.",
  },
  {
    key: "sleep",
    title: "Сон",
    description: "Факторы восстановления: длительность, стабильность и оценка «долга сна».",
  },
  {
    key: "heart_rate",
    title: "Пульс",
    description: "Пульс из Health Connect в карточке аналитики.",
  },
  {
    key: "total_calories",
    title: "Суточные калории (total)",
    description: "Total calories браслета для скорректированного расхода за день.",
  },
  {
    key: "active_calories",
    title: "Активные калории",
    description: "Active calories браслета, если total недоступен.",
  },
  {
    key: "workout_calories",
    title: "Калории тренировок",
    description: "HC workout kcal как fallback, когда нет Polar/FIT (приоритет в resolver).",
  },
  {
    key: "weight",
    title: "Вес",
    description: "Вес из Health Connect, если нет ручной записи.",
  },
];

export function AnalyticsSettings({
  embedded = false,
  standalone = false,
}: {
  embedded?: boolean;
  standalone?: boolean;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analyticsSettings,
    queryFn: fetchAnalyticsSettings,
  });
  const [includeWarmup, setIncludeWarmup] = useState(false);
  const [hcPrefs, setHcPrefs] = useState<HcAnalyticsPrefs>(DEFAULT_HC_ANALYTICS_PREFS);

  useEffect(() => {
    if (data) {
      setIncludeWarmup(data.include_warmup_in_analytics);
      setHcPrefs({ ...DEFAULT_HC_ANALYTICS_PREFS, ...data.hc_analytics });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: saveAnalyticsSettings,
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.analyticsSettings, saved);
      void qc.invalidateQueries({ queryKey: ["strength"] });
      void qc.invalidateQueries({ queryKey: queryKeys.sleepSummary(7) });
      void qc.invalidateQueries({ queryKey: ["analytics", "passive-hr"] });
      showToast("Настройки аналитики сохранены", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const persist = useCallback(
    (patch: Parameters<typeof saveAnalyticsSettings>[0]) => {
      saveMut.mutate(patch);
    },
    [saveMut],
  );

  const onWarmupToggle = (checked: boolean) => {
    setIncludeWarmup(checked);
    persist({ include_warmup_in_analytics: checked });
  };

  const onHcToggle = (key: (typeof HC_ANALYTICS_METRIC_KEYS)[number], checked: boolean) => {
    const next = { ...hcPrefs, [key]: checked };
    setHcPrefs(next);
    persist({ hc_analytics: { [key]: checked } });
  };

  const body = isLoading ? (
    <Loader label="Загрузка…" />
  ) : (
    <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm cursor-pointer rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3">
            <input
              type="checkbox"
              checked={includeWarmup}
              disabled={saveMut.isPending}
              onChange={(e) => onWarmupToggle(e.target.checked)}
              className="mt-0.5 rounded border-slate-300"
            />
            <span>
              <span className="font-medium text-slate-800 dark:text-slate-100 block">
                Учитывать разминочные подходы в графиках прогресса и расчётах нагрузки
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block leading-relaxed">
                По умолчанию разминка исключена из 1ПМ, максимального веса, объёма и таблицы
                прогресса.
              </span>
            </span>
          </label>

          <div className="rounded-lg border border-slate-200 dark:border-slate-600 px-4 py-3 space-y-3">
            <HcAnalyticsMasterToggle className="border-0 bg-transparent px-0 py-0" />
            <div>
              <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Метрики Health Connect
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Доступны при включённом переключателе выше. При устаревших данных показывается
                предупреждение.
              </p>
            </div>
            {HC_TOGGLES.map(({ key, title, description }) => (
              <label
                key={key}
                className="flex items-start gap-3 text-sm cursor-pointer rounded-md px-1 py-1"
              >
                <input
                  type="checkbox"
                  checked={hcPrefs[key]}
                  disabled={saveMut.isPending || !hcPrefs.use_in_analytics}
                  onChange={(e) => onHcToggle(key, e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  <span className="font-medium text-slate-800 dark:text-slate-100 block">
                    {title}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed max-w-2xl">
          Управление тем, какие метрики Health Connect попадают в графики. Приоритет Polar / FIT /
          локальных данных — в разделе{" "}
          <a href="/settings?tab=sync" className="font-semibold text-[rgb(var(--app-accent))] hover:underline">
            Синхронизация
          </a>
          .
        </p>
        {body}
      </div>
    );
  }

  return (
    <CollapsibleSection
      title="Аналитика"
      description="Силовые графики, 1ПМ, объём нагрузки, Health Connect"
      defaultOpen={false}
      embedded={embedded}
    >
      {body}
    </CollapsibleSection>
  );
}
