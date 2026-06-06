import { Flame, Moon, Timer, Wind } from "lucide-react";
import type { RecoveryStatus } from "../hooks/useStretchingStats";
import { RECOVERY_LABELS } from "../hooks/useStretchingStats";

type Props = {
  recoveryStatus: RecoveryStatus;
  streak: number;
  sessionsThisWeek: number;
  minutesThisWeek: number;
  estimatedSessionMin: number;
};

const STATUS_ICON: Record<RecoveryStatus, typeof Wind> = {
  rested: Moon,
  ready: Wind,
  recovering: Flame,
  rest: Moon,
};

export function RecoveryInsights({
  recoveryStatus,
  streak,
  sessionsThisWeek,
  minutesThisWeek,
  estimatedSessionMin,
}: Props) {
  const StatusIcon = STATUS_ICON[recoveryStatus];

  const items = [
    {
      icon: StatusIcon,
      label: "Восстановление",
      value: RECOVERY_LABELS[recoveryStatus],
    },
    {
      icon: Flame,
      label: "Серия",
      value: streak > 0 ? `${streak} ${streak === 1 ? "день" : "дня"}` : "—",
    },
    {
      icon: Timer,
      label: "На этой неделе",
      value: `${minutesThisWeek} мин · ${sessionsThisWeek} сесс.`,
    },
    {
      icon: Wind,
      label: "Типичная сессия",
      value: `~${estimatedSessionMin} мин`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="stretch-wellness__glass rounded-2xl p-4 flex flex-col gap-2 min-h-[5.5rem]"
        >
          <Icon className="h-4 w-4 text-teal-600/80 dark:text-teal-400/90" aria-hidden />
          <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--stretch-muted))]">
            {label}
          </span>
          <span className="text-sm font-medium text-[hsl(var(--stretch-ink))] leading-snug">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
