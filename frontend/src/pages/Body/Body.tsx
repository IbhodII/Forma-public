import { useEffect, useState } from "react";
import "./body.css";
import "./body-layout.css";
import { BodyMetricFormModal } from "../../components/BodyMetricFormModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import {
  BODY_HISTORY_PAGE_SIZE,
  useBodyChartSeries,
  useBodyHistory,
  useBodyMetricsSummary,
  useDeleteBodyMetric,
  useSaveBodyMetric,
} from "../../hooks/useBodyMetrics";
import { useUnits } from "../../hooks/useUnits";
import type { BodyMetricCreate, BodyMetricRow } from "../../types";
import type { BodyChartPeriod, BodyUnitsFormatProps } from "../../utils/bodyMetrics";
import { parseApiError } from "../../utils/validation";
import { useToast } from "../../components/Toast";
import { BodySection } from "./components/BodySection";
import { BodySummaryHero } from "./components/BodySummaryHero";
import { BodyInsights } from "./components/BodyInsights";
import { BodyCompositionSection } from "./components/BodyCompositionSection";
import { BodyProgressSection } from "./components/BodyProgressSection";
import { BodyHistoryTimeline } from "./components/BodyHistoryTimeline";
import { MetricDetailsModal } from "./components/MetricDetailsModal";
import { ConfirmModal } from "../../components/ConfirmModal";

/**
 * Вкладка «Замеры тела» на странице /body: hero, состав, динамика, история.
 */
export function Body({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const {
    formatBodyWeight,
    formatBarbellWeight,
    formatWeightChange,
    formatHeight,
    formatCircumference,
    formatCircumferenceChange,
  } = useUnits();
  const [historyOffset, setHistoryOffset] = useState(0);
  const [chartPeriod, setChartPeriod] = useState<BodyChartPeriod>("90d");
  const [chartsEnabled, setChartsEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<BodyMetricRow | null>(null);
  const [detailRow, setDetailRow] = useState<BodyMetricRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<BodyMetricRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setChartsEnabled(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const { data: summaryData, isLoading: summaryLoading } = useBodyMetricsSummary();
  const { data: historyData, isLoading: historyLoading, isError, error } = useBodyHistory(historyOffset);
  const { data: controlChartData, isLoading: controlChartLoading } = useBodyChartSeries(
    chartPeriod,
    chartsEnabled,
    { controlDayOnly: true },
  );

  const saveMut = useSaveBodyMetric();
  const deleteMut = useDeleteBodyMetric();

  const submitForm = (body: BodyMetricCreate) => {
    setFormError(null);
    saveMut.mutate(body, {
      onSuccess: (res) => {
        if (res.status === "duplicate") {
          const msg = "Замер за эту дату уже есть (включите перезапись)";
          setFormError(msg);
          showToast(msg, "error");
          return;
        }
        if (res.status === "empty") {
          const msg = "Укажите хотя бы одно положительное значение";
          setFormError(msg);
          showToast(msg, "error");
          return;
        }
        showToast(editRow ? "Замер обновлён" : "Замер сохранён", "success");
        setHistoryOffset(0);
        setShowForm(false);
        setEditRow(null);
        setDetailRow(null);
      },
      onError: (e) => {
        const msg = parseApiError(e);
        setFormError(msg);
        showToast(msg, "error");
      },
    });
  };

  const openEdit = (row: BodyMetricRow) => {
    setDetailRow(null);
    setEditRow(row);
    setShowForm(true);
    setFormError(null);
  };

  const confirmDelete = () => {
    const date = String(deleteRow?.date ?? "").slice(0, 10);
    if (!date) return;
    deleteMut.mutate(date, {
      onSuccess: () => {
        showToast("Замер удалён", "success");
        setDeleteRow(null);
        setDetailRow(null);
        setEditRow(null);
        setShowForm(false);
        if ((historyData?.items.length ?? 0) <= 1 && historyOffset > 0) {
          setHistoryOffset(Math.max(0, historyOffset - BODY_HISTORY_PAGE_SIZE));
        }
      },
      onError: (e) => {
        showToast(parseApiError(e), "error");
      },
    });
  };

  if (summaryLoading && !summaryData) {
    return <Loader label="Загрузка замеров…" />;
  }

  const unitsFormat: BodyUnitsFormatProps = {
    formatBodyWeight,
    formatBarbellWeight,
    formatWeightChange,
    formatHeight,
    formatCircumference,
    formatCircumferenceChange,
  };

  const controlChartRows = controlChartData?.items ?? [];

  return (
    <div className="body-dashboard">
      <div className={`body-dashboard__toolbar ${embedded ? "justify-end" : ""}`}>
        {!embedded && (
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">Замеры тела</h2>
            <p className="text-sm text-[rgb(var(--app-text-muted))] mt-0.5">
              Состав, динамика и контрольные замеры
            </p>
          </div>
        )}
        <button
          type="button"
          className="btn-primary shrink-0 sm:w-auto"
          onClick={() => {
            setEditRow(null);
            setShowForm(true);
            setFormError(null);
          }}
        >
          + Добавить замер
        </button>
      </div>

      {isError && <ErrorAlert message={parseApiError(error)} />}

      <BodySection
        id="body-summary"
        title="Сводка"
        description="Ключевые показатели последнего контрольного замера и мини-тренды."
      >
        <BodySummaryHero summary={summaryData} chartRows={controlChartRows} units={unitsFormat} />
        <BodyInsights summary={summaryData} chartRows={controlChartRows} />
      </BodySection>

      <BodySection
        id="body-composition"
        title="Состав тела"
        description="Распределение массы, FFMI и прогресс к генетическому пределу сухой массы."
      >
        <BodyCompositionSection summary={summaryData} />
      </BodySection>

      <div className="body-dashboard__wide-row">
      <BodySection
        id="body-progress"
        title="Динамика"
        description="Только контрольные замеры (первый день недели с полным набором измерений). Переключайте метрики и период; двойной клик — фокус."
      >
        <BodyProgressSection
          rows={controlChartRows}
          isLoading={chartsEnabled && controlChartLoading}
          period={chartPeriod}
          onPeriodChange={setChartPeriod}
        />
      </BodySection>

      <BodySection
        id="body-history"
        title="История замеров"
        description="Краткая сводка в строке; раскройте запись для всех групп измерений. График — выше."
      >
        <BodyHistoryTimeline
          items={historyData?.items ?? []}
          total={historyData?.meta.total ?? 0}
          offset={historyOffset}
          onOffsetChange={setHistoryOffset}
          isLoading={historyLoading}
          onSelect={setDetailRow}
          onDelete={setDeleteRow}
          deletingDate={
            deleteMut.isPending && deleteRow?.date ? String(deleteRow.date).slice(0, 10) : null
          }
          units={unitsFormat}
        />
      </BodySection>
      </div>

      {detailRow && (
        <MetricDetailsModal
          row={detailRow}
          units={unitsFormat}
          onClose={() => setDetailRow(null)}
          onEdit={() => openEdit(detailRow)}
        />
      )}

      {showForm && (
        <BodyMetricFormModal
          formError={formError}
          isPending={saveMut.isPending}
          initialRow={editRow ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditRow(null);
            setFormError(null);
          }}
          onSubmit={submitForm}
        />
      )}

      <ConfirmModal
        open={deleteRow !== null}
        title="Удалить замер?"
        message="Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        loading={deleteMut.isPending}
        onCancel={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
