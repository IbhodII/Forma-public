import { StatusBadge } from "../../../components/analytics/StatusBadge";

const SOURCE_LABELS: Record<string, string> = {
  health_connect: "Health Connect",
  polar_historical: "Polar",
  fit_coospo: "FIT",
  manual: "Manual",
  excel: "Excel",
};

export function formatHcSource(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source;
}

export function HcSourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return (
    <StatusBadge tone="neutral" size="sm">
      {formatHcSource(source)}
    </StatusBadge>
  );
}
