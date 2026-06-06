import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useCycleFeatureEnabled } from "../hooks/useCycleFeatureEnabled";
import { useUserProfile } from "../hooks/useUserProfile";
import { SettingsIcon } from "./SettingsIcon";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Home,
  LineChart,
  StretchHorizontal,
  UtensilsCrossed,
  UserRound,
} from "lucide-react";
import { cn } from "../lib/utils";

const BASE_NAV = [
  { to: "/home", label: "Главная", short: "Главная", Icon: Home },
  { to: "/workouts", label: "Тренировки", short: "Силовые", Icon: Dumbbell },
  { to: "/stretching", label: "Растяжка", short: "Растяжка", Icon: StretchHorizontal },
  { to: "/body", label: "Тело", short: "Тело", Icon: UserRound },
  { to: "/food", label: "Питание", short: "Питание", Icon: UtensilsCrossed },
  { to: "/analytics", label: "Аналитика", short: "Аналитика", Icon: LineChart },
] as const;

const CYCLE_NAV = { to: "/cycle", label: "Цикл", short: "Цикл", Icon: CalendarDays } as const;

function navLinkClass(isActive: boolean, collapsed: boolean) {
  return cn(
    "app-nav-link group w-full flex items-center rounded-xl transition-all border relative",
    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
    isActive
      ? "app-nav-link--active bg-[rgb(var(--app-accent)/0.14)] text-[rgb(var(--app-accent))] border-[rgb(var(--app-accent)/0.32)] shadow-[var(--app-shadow-sm)]"
      : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle)/0.85)] border-transparent hover:border-[rgb(var(--app-border)/0.5)]",
  );
}

export function Layout() {
  const { data: profile } = useUserProfile();
  const cycleEnabled = useCycleFeatureEnabled();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const nav = useMemo(() => {
    return cycleEnabled ? [...BASE_NAV, CYCLE_NAV] : [...BASE_NAV];
  }, [cycleEnabled]);
  const headerDisplayName = profile?.effective_display_name?.trim();

  return (
    <div className="min-h-screen flex bg-[rgb(var(--app-bg))] text-[rgb(var(--app-text))]">
      {/* Desktop sidebar: 64px collapsed / 220px expanded */}
      <aside
        className={cn(
          "app-sidebar hidden lg:flex lg:flex-col border-r shrink-0 transition-[width] duration-200 ease-out",
          sidebarCollapsed ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b gap-2",
            sidebarCollapsed ? "justify-center px-2 py-3" : "px-3 py-4 gap-3",
          )}
          style={{ borderColor: "rgb(var(--app-border))" }}
        >
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border bg-white/80 dark:bg-slate-900/60"
            style={{ borderColor: "rgb(var(--app-border))" }}
          >
            <img src="/logo.png" alt="Forma" className="h-full w-full object-cover scale-[1.22]" />
          </div>
          {!sidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight truncate">Forma</div>
              {headerDisplayName ? (
                <div
                  className="text-xs text-[rgb(var(--app-text-muted))] truncate"
                  title={headerDisplayName}
                >
                  {headerDisplayName}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Навигация">
          <ul className="space-y-1.5">
            {nav.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} title={sidebarCollapsed ? label : undefined} className={({ isActive }) => navLinkClass(isActive, sidebarCollapsed)}>
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {!sidebarCollapsed ? (
                    <span className="text-sm font-medium truncate">{label}</span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgb(var(--app-border))" }}>
            <NavLink
              to="/settings"
              title={sidebarCollapsed ? "Настройки" : undefined}
              className={({ isActive }) => navLinkClass(isActive, sidebarCollapsed)}
            >
              <SettingsIcon className="h-5 w-5" />
              {!sidebarCollapsed ? <span className="text-sm font-medium">Настройки</span> : null}
            </NavLink>
          </div>
        </nav>

        <div className="p-2 border-t" style={{ borderColor: "rgb(var(--app-border))" }}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!sidebarCollapsed ? <span>Свернуть</span> : null}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="lg:hidden border-b shadow-[var(--app-shadow-sm)]"
          style={{
            backgroundColor: "rgb(var(--app-header))",
            borderColor: "rgb(var(--app-border))",
          }}
        >
          <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Forma"
                className="h-8 w-8 rounded-md bg-white/80 dark:bg-slate-900/60 object-cover scale-[1.16]"
              />
              <h1 className="text-sm font-semibold text-brand-700 dark:text-brand-400">Forma</h1>
              {headerDisplayName ? (
                <p className="text-xs text-[rgb(var(--app-text-muted))] truncate">{headerDisplayName}</p>
              ) : null}
            </div>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  "shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
                  isActive
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
                    : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-subtle))]",
                )
              }
              aria-label="Настройки"
            >
              <SettingsIcon className="h-5 w-5" />
            </NavLink>
          </div>
        </header>

        <main className="dashboard-shell flex-1 w-full mx-auto px-3 sm:px-4 lg:px-5 xl:px-6 py-3 sm:py-5 pb-20 sm:pb-24 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t safe-area-pb"
          style={{
            borderColor: "rgb(var(--app-border))",
            backgroundColor: "rgb(var(--app-surface) / 0.92)",
            backdropFilter: "blur(8px)",
          }}
          aria-label="Мобильная навигация"
        >
          <ul className="flex items-stretch justify-around max-w-lg mx-auto px-1 pt-0.5 pb-0.5">
            {nav.map(({ to, short, Icon }) => (
              <li key={to} className="flex-1 max-w-[4.5rem]">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[10px] font-medium transition-colors min-h-[46px]",
                      isActive
                        ? "text-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent)/0.1)]"
                        : "text-[rgb(var(--app-text-muted))]",
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="truncate w-full text-center leading-tight">{short}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
