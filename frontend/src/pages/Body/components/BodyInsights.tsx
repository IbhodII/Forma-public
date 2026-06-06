import { buildBodyInsights } from "../utils/bodyInsights";
import type { BodyMetricsSummary } from "../../../api/body";
import type { BodyMetricRow } from "../../../types";

export function BodyInsights({
  summary,
  chartRows,
}: {
  summary: BodyMetricsSummary | undefined;
  chartRows: BodyMetricRow[];
}) {
  const items = buildBodyInsights(summary, chartRows);
  if (!items.length) return null;

  return (
    <div className="body-insights" role="note">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
        Наблюдения
      </p>
      <ul className="space-y-2 mt-2">
        {items.map((text) => (
          <li key={text} className="body-insights__item">
            <span className="body-insights__bullet" aria-hidden>
              •
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
