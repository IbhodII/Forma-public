import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useDashboardHome } from "../../hooks/useDashboardHome";
import { useDashboardTrainingLoad } from "../../hooks/useDashboardTrainingLoad";
import { useUserProfile } from "../../hooks/useUserProfile";
import { DashboardHeroStrip } from "./dashboard/DashboardHeroStrip";
import { DashboardQuickActions } from "./dashboard/DashboardQuickActions";
import { DashboardStatusPanel } from "./dashboard/DashboardStatusPanel";
import { DashboardTodayPanel } from "./dashboard/DashboardTodayPanel";
import { DashboardTrainingLoadPanel } from "./dashboard/DashboardTrainingLoadPanel";
import "./dashboard/dashboard.css";

function greetingForHour(h: number) {
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function formatHeroDate(isoDate: string) {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return isoDate;
  }
}

export function DashboardPage() {
  const { data: profile } = useUserProfile();
  const dashboard = useDashboardHome("cut");
  const trainingLoad = useDashboardTrainingLoad(dashboard);
  const name = profile?.effective_display_name?.trim();
  const greeting = greetingForHour(new Date().getHours());
  const dateLabel = formatHeroDate(dashboard.today);

  return (
    <div className="dashboard-v2 dashboard-page mx-auto w-full space-y-4 sm:space-y-5 px-0 pb-6">
      <header className="dashboard-hero" aria-label="Сводка дня">
        <div className="dashboard-hero__glass">
          <div className="min-w-0 flex-1">
            <p className="dashboard-hero__greeting">
              {greeting}
              {name ? `, ${name}` : ""}
            </p>
            <h1 className="dashboard-hero__title">Сводка дня</h1>
            <p className="dashboard-hero__date">{dateLabel}</p>
          </div>
          <div className="dashboard-hero__actions">
            <Link to="/workouts" className="dashboard-primary-btn">
              <Plus className="h-4 w-4" aria-hidden />
              Тренировка
            </Link>
            <Link to="/food" className="dashboard-outline-btn">
              Питание
            </Link>
            <Link to="/body" className="dashboard-outline-btn">
              Тело
            </Link>
            <Link to="/body?tab=health-connect" className="dashboard-outline-btn hidden sm:inline-flex">
              Health Connect
            </Link>
          </div>
        </div>
      </header>

      <section aria-label="Ключевые показатели">
        <DashboardHeroStrip data={dashboard} trainingLoad={trainingLoad} />
      </section>

      <div className="dashboard-v2__middle">
        <div className="dashboard-v2__left-stack">
          <DashboardTodayPanel data={dashboard} />
          <DashboardTrainingLoadPanel
            current={trainingLoad.current}
            metricsReady={trainingLoad.metricsReady}
            trimpToday={trainingLoad.trimpToday}
            loading={trainingLoad.isLoading}
          />
          <DashboardQuickActions />
        </div>
        <DashboardStatusPanel data={dashboard} />
      </div>
    </div>
  );
}

export {
  DashboardCardShell,
  DashboardHeroMetric,
  type DashboardCardVariant,
} from "./dashboard/DashboardShell";
