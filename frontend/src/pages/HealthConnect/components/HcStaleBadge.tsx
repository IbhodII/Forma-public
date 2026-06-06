import { StatusBadge } from "../../../components/analytics/StatusBadge";

export function HcStaleBadge({ label = "Stale" }: { label?: string }) {
  return (
    <StatusBadge tone="warning" size="xs">
      {label}
    </StatusBadge>
  );
}
