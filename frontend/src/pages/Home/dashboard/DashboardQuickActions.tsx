import { Link } from "react-router-dom";
import {
  BarChart3,
  CloudDownload,
  Dumbbell,
  NotebookPen,
  RefreshCw,
  Smartphone,
  UtensilsCrossed,
} from "lucide-react";

const ACTIONS = [
  {
    to: "/workouts",
    label: "Записать тренировку",
    hint: "Силовые и кардио",
    primary: true,
    Icon: Dumbbell,
  },
  {
    to: "/food",
    label: "Добавить еду",
    hint: "Приёмы и цели",
    primary: false,
    Icon: UtensilsCrossed,
  },
  {
    to: "/body?tab=health-connect",
    label: "Health Connect",
    hint: "Шаги, сон, пульс",
    primary: false,
    Icon: Smartphone,
  },
  {
    to: "/settings?tab=data",
    label: "Импорт данных",
    hint: "Polar, FIT, облако",
    primary: false,
    Icon: CloudDownload,
  },
  {
    to: "/settings?tab=sync",
    label: "Синхронизация",
    hint: "FormaSync и Диск",
    primary: false,
    Icon: RefreshCw,
  },
  {
    to: "/analytics",
    label: "Аналитика",
    hint: "Нагрузка и прогресс",
    primary: false,
    Icon: BarChart3,
  },
  {
    to: "/food",
    label: "Заметка дня",
    hint: "Дневник питания",
    primary: false,
    Icon: NotebookPen,
  },
] as const;

export function DashboardQuickActions() {
  return (
    <section aria-label="Быстрые действия">
      <h2 className="dashboard-section-label mb-2">Быстрые действия</h2>
      <div className="dashboard-v2__actions">
        {ACTIONS.map(({ to, label, hint, primary, Icon }) => (
          <Link
            key={label}
            to={to}
            className={`dashboard-action-card ${primary ? "dashboard-action-card--primary" : ""}`}
          >
            <span className="dashboard-action-card__icon-wrap" aria-hidden>
              <Icon className="h-5 w-5" />
            </span>
            <span className="dashboard-action-card__label">{label}</span>
            <span className="dashboard-action-card__hint">{hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
