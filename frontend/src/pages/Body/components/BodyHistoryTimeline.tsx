import { useState } from "react";
import { Pagination } from "../../../components/Pagination";
import { Loader } from "../../../components/Loader";
import { useUserProfile } from "../../../hooks/useUserProfile";
import type { BodyMetricRow } from "../../../types";
import { BODY_HISTORY_PAGE_SIZE } from "../../../hooks/useBodyMetrics";
import {
  BODY_DETAIL_SECTIONS,
  formatBodyDetailValue,
  formatMetricNum,
  type BodyUnitsFormatProps,
} from "../../../utils/bodyMetrics";
import { formatDateRu } from "../../../utils/format";

function sectionFieldsClass(fieldCount: number): string {
  return fieldCount > 3
    ? "body-timeline-item__section-fields body-timeline-item__section-fields--wide"
    : "body-timeline-item__section-fields";
}

function TimelineEntry({
  row,
  units,
  onOpen,
  onDelete,
  deletePending,
}: {
  row: BodyMetricRow;
  units: BodyUnitsFormatProps;
  onOpen: () => void;
  onDelete: () => void;
  deletePending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { formatBodyWeight, formatBarbellWeight, formatCircumference } = units;
  const dateStr = formatDateRu(String(row.date ?? ""));

  const metrics: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value != null && value !== "—" && String(value).trim() !== "") {
      metrics.push({ label, value: String(value) });
    }
  };

  push("Вес", row.weight_kg != null ? formatBodyWeight(Number(row.weight_kg)) : null);
  push("Жир", row.body_fat_percent != null ? formatMetricNum(row.body_fat_percent, "%") : null);
  push(
    "Мышцы",
    row.muscle_mass_kg != null ? formatBarbellWeight(Number(row.muscle_mass_kg)) : null,
  );
  push("Талия", row.waist_cm != null ? formatCircumference(Number(row.waist_cm)) : null);
  push("Бёдра", row.hips_cm != null ? formatCircumference(Number(row.hips_cm)) : null);
  push(
    "Грудь",
    row.chest_avg_cm != null
      ? formatCircumference(Number(row.chest_avg_cm))
      : row.chest_inhale_cm != null
        ? formatCircumference(Number(row.chest_inhale_cm))
        : null,
  );
  push(
    "Бицепс",
    row.bicep_relaxed_cm != null ? formatCircumference(Number(row.bicep_relaxed_cm)) : null,
  );
  push(
    "Бедро",
    row.thigh_relaxed_cm != null ? formatCircumference(Number(row.thigh_relaxed_cm)) : null,
  );

  return (
    <article className="body-timeline-item">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="body-timeline-item__summary min-w-0 flex-1"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span
            className={`body-timeline-item__chevron ${open ? "body-timeline-item__chevron--open" : ""}`}
            aria-hidden
          >
            ›
          </span>
          <time className="body-timeline-item__date" dateTime={String(row.date ?? "")}>
            {dateStr}
          </time>
          <div className="body-timeline-item__metrics">
            {metrics.length ? (
              metrics.map((p) => (
                <span key={p.label} className="body-timeline-item__metric">
                  <span className="body-timeline-item__metric-label">{p.label}</span>{" "}
                  <span className="body-timeline-item__metric-value">{p.value}</span>
                </span>
              ))
            ) : (
              <span className="text-sm text-[rgb(var(--app-text-muted))]">Нет числовых значений</span>
            )}
          </div>
        </button>
        <button
          type="button"
          className="btn-secondary text-xs shrink-0 text-red-600 dark:text-red-400"
          disabled={deletePending}
          onClick={onDelete}
        >
          Удалить
        </button>
      </div>

      {open ? (
        <div className="body-timeline-item__details">
          <div className="body-timeline-item__sections">
            {BODY_DETAIL_SECTIONS.map((section) => {
              const fields = section.fields.filter((f) => {
                const v = row[f.key as keyof BodyMetricRow];
                return v != null && Number(v) > 0;
              });
              if (!fields.length) return null;
              return (
                <div key={section.title} className="body-timeline-item__section min-w-0">
                  <p className="body-timeline-item__section-title">{section.title}</p>
                  <dl className={sectionFieldsClass(fields.length)}>
                    {fields.map((f) => (
                      <div key={f.key}>
                        <dt className="body-timeline-item__field-label">{f.label}</dt>
                        <dd className="body-timeline-item__field-value">
                          {formatBodyDetailValue(f.key, row[f.key as keyof BodyMetricRow], units)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={onOpen}>
            Полные детали
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function BodyHistoryTimeline({
  items,
  total,
  offset,
  onOffsetChange,
  isLoading,
  onSelect,
  onDelete,
  deletingDate,
  units,
}: {
  items: BodyMetricRow[];
  total: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  isLoading: boolean;
  onSelect: (row: BodyMetricRow) => void;
  onDelete: (row: BodyMetricRow) => void;
  deletingDate?: string | null;
  units: BodyUnitsFormatProps;
}) {
  const { data: profile } = useUserProfile();
  const weekLabel = profile?.week_start_label?.toLowerCase() ?? "суббота";

  if (isLoading) {
    return <Loader label="История замеров…" />;
  }

  if (!total) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--app-border))] text-center py-10 px-4">
        <p className="font-medium">Замеров пока нет</p>
        <p className="text-sm text-[rgb(var(--app-text-muted))] mt-2 max-w-md mx-auto leading-relaxed">
          Сохранённые замеры появятся здесь. Контрольные дни ({weekLabel}) — с полным набором: вес,
          жир, мышцы, талия и бёдра.
        </p>
      </div>
    );
  }

  return (
    <div className="body-history-panel">
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
        Все сохранённые замеры по дате. Контрольный день недели — {weekLabel}. В строке основные
        показатели; раскройте запись для груди, рук, ног и остальных полей.
      </p>
      <div className="body-history-scroll">
        {items.map((row) => (
          <TimelineEntry
            key={String(row.date)}
            row={row}
            units={units}
            onOpen={() => onSelect(row)}
            onDelete={() => onDelete(row)}
            deletePending={deletingDate === String(row.date ?? "").slice(0, 10)}
          />
        ))}
      </div>
      <div className="shrink-0 pt-1 border-t border-[rgb(var(--app-border)/0.4)]">
        <Pagination
          total={total}
          limit={BODY_HISTORY_PAGE_SIZE}
          offset={offset}
          onChange={onOffsetChange}
        />
      </div>
    </div>
  );
}
