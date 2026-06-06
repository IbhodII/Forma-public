import { useEffect } from "react";
import type { StrengthOneRmChartPoint } from "../../../api/strength";
import type { StrengthVolumeDay, TopExerciseProgress } from "../../../types";
import { SECTION_HINTS } from "../analyticsHints";
import {
  STANDARD_PERIOD_OPTIONS,
  type StandardPeriodId,
} from "../utils/analyticsPeriods";
import { AnalyticsCard } from "./AnalyticsCard";
import { OneRmChart } from "./OneRmChart";
import { PeriodTabs } from "./PeriodTabs";
import { PrTrackingCards } from "./PrTrackingCards";
import { StrengthHrAnalyticsSection } from "./StrengthHrAnalyticsSection";
import { StrengthVolumeChart } from "./StrengthVolumeChart";

export type StrengthAnalyticsTabId = "e1rm" | "progress" | "volume" | "strength-hr";

const STRENGTH_TABS: { id: StrengthAnalyticsTabId; label: string }[] = [
  { id: "e1rm", label: "1ПМ" },
  { id: "progress", label: "PR" },
  { id: "volume", label: "Объём" },
  { id: "strength-hr", label: "Пульс в силовых" },
];

export function StrengthAnalyticsBlock({
  tab,
  onTabChange,
  exercises,
  activeExercise,
  onExerciseChange,
  oneRmPeriod,
  onOneRmPeriodChange,
  volumePeriod,
  onVolumePeriodChange,
  oneRmMa7,
  onOneRmMa7Change,
  oneRmChartData,
  oneRmChartLoading,
  topProgress,
  topProgressLoading,
  volumeData,
  volumeLoading,
  hrAnalyticsEnabled = false,
}: {
  tab: StrengthAnalyticsTabId;
  onTabChange: (tab: StrengthAnalyticsTabId) => void;
  exercises: string[];
  activeExercise: string;
  onExerciseChange: (v: string) => void;
  oneRmPeriod: StandardPeriodId;
  onOneRmPeriodChange: (v: StandardPeriodId) => void;
  volumePeriod: StandardPeriodId;
  onVolumePeriodChange: (v: StandardPeriodId) => void;
  oneRmMa7: boolean;
  onOneRmMa7Change: (v: boolean) => void;
  oneRmChartData: StrengthOneRmChartPoint[];
  oneRmChartLoading: boolean;
  topProgress: TopExerciseProgress[];
  topProgressLoading: boolean;
  volumeData: StrengthVolumeDay[];
  volumeLoading: boolean;
  hrAnalyticsEnabled?: boolean;
}) {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "strength-hr") {
      onTabChange("strength-hr");
    }
  }, [onTabChange]);

  const periodActions = (value: StandardPeriodId, onChange: (v: StandardPeriodId) => void) => (
    <PeriodTabs
      value={value}
      options={STANDARD_PERIOD_OPTIONS}
      onChange={onChange}
      variant="segmented"
    />
  );

  return (
    <div className="space-y-4">
      <div className="subtabs-track w-full sm:w-auto" role="tablist" aria-label="Силовая аналитика">
        {STRENGTH_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={tab === t.id ? "subtabs-tab-active" : "subtabs-tab"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "e1rm" && (
        <AnalyticsCard
          variant="nested"
          title={SECTION_HINTS.strength1rm.title}
          hint={SECTION_HINTS.strength1rm.hint}
          description={SECTION_HINTS.strength1rm.description}
          actions={periodActions(oneRmPeriod, onOneRmPeriodChange)}
        >
          <div className="analytics-section-grid analytics-section-grid--strength">
            <div className="min-w-0">
              {oneRmChartLoading ? (
                <p className="text-sm text-slate-500 py-10 text-center">Загрузка 1ПМ…</p>
              ) : (
                <OneRmChart items={oneRmChartData} movingAverage7={oneRmMa7} />
              )}
            </div>
            <div className="space-y-4 min-w-0">
              <label className="text-sm block desktop-form-max">
                <span className="text-[rgb(var(--app-text-muted))] text-xs font-medium uppercase tracking-wide">
                  Упражнение
                </span>
                <select
                  value={activeExercise}
                  onChange={(e) => onExerciseChange(e.target.value)}
                  className="input-field mt-1.5 min-h-10 w-full rounded-xl text-sm"
                  disabled={!exercises.length}
                >
                  {exercises.map((ex) => (
                    <option key={ex} value={ex}>
                      {ex}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer min-h-10">
                <input
                  type="checkbox"
                  checked={oneRmMa7}
                  onChange={(e) => onOneRmMa7Change(e.target.checked)}
                  className="rounded border-slate-300 h-4 w-4"
                />
                <span className="text-[rgb(var(--app-text-muted))]">Скользящее среднее (7 дней)</span>
              </label>
            </div>
          </div>
        </AnalyticsCard>
      )}

      {tab === "progress" && (
        <AnalyticsCard
          variant="nested"
          title={SECTION_HINTS.strengthTable.title}
          hint={SECTION_HINTS.strengthTable.hint}
          description={SECTION_HINTS.strengthTable.description}
          isLoading={topProgressLoading}
          loadingLabel="Прогресс по упражнениям…"
        >
          <PrTrackingCards items={topProgress} />
        </AnalyticsCard>
      )}

      {tab === "volume" && (
        <AnalyticsCard
          variant="nested"
          title={SECTION_HINTS.strengthVolume.title}
          hint={SECTION_HINTS.strengthVolume.hint}
          description={SECTION_HINTS.strengthVolume.description}
          actions={periodActions(volumePeriod, onVolumePeriodChange)}
          isLoading={volumeLoading}
          loadingLabel="Объём нагрузки…"
          isEmpty={!volumeLoading && !volumeData.length}
          emptyMessage="Нет силовых за выбранный период"
        >
          <StrengthVolumeChart items={volumeData} />
        </AnalyticsCard>
      )}

      {tab === "strength-hr" && (
        <AnalyticsCard
          variant="nested"
          title="Пульс в силовых"
          hint="Пики пульса по подходам с подтверждённой разметкой"
          description="Сводка по сессиям с пульсом, тренды восстановления и сравнение упражнений."
        >
          <StrengthHrAnalyticsSection enabled={hrAnalyticsEnabled} exerciseOptions={exercises} />
        </AnalyticsCard>
      )}
    </div>
  );
}
