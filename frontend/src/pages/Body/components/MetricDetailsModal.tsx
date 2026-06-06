import type { BodyMetricRow } from "../../../types";
import { ModalShell } from "../../../components/ui/modal";
import { BODY_DETAIL_SECTIONS, formatBodyDetailValue, type BodyUnitsFormatProps } from "../../../utils/bodyMetrics";
import { formatDateRu } from "../../../utils/format";

export function MetricDetailsModal({
  row,
  units,
  onClose,
  onEdit,
}: {
  row: BodyMetricRow;
  units: BodyUnitsFormatProps;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dateStr = formatDateRu(String(row.date ?? ""));

  return (
    <ModalShell
      open
      onClose={onClose}
      title={`Замер от ${dateStr}`}
      size="lg"
      zIndex={50}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn-secondary" onClick={onEdit}>
            Редактировать
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {BODY_DETAIL_SECTIONS.map((section) => (
          <div key={section.title}>
            <h4
              className="text-sm font-semibold border-b pb-1 mb-2 text-[rgb(var(--app-text))]"
              style={{ borderColor: "rgb(var(--app-border) / 0.6)" }}
            >
              {section.title}
            </h4>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {section.fields.map((f) => (
                <div key={f.key} className="flex justify-between sm:block gap-2">
                  <dt className="text-[rgb(var(--app-text-muted))]">{f.label}</dt>
                  <dd className="font-medium tabular-nums sm:mt-0.5">
                    {formatBodyDetailValue(f.key, row[f.key], units)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
