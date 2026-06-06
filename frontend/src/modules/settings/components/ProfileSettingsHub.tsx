import { Link, useNavigate } from "react-router-dom";
import { Cloud, LogOut, Smartphone } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { useUserProfile } from "../../../hooks/useUserProfile";
import { useConnectionsStatus } from "../hooks/useConnectionsStatus";
import { ProfileSummaryCard } from "./ProfileSummaryCard";
import { GeneralSettings } from "./GeneralSettings";
import { ProfileSection } from "../../../pages/ProfilePage";
import { SettingsSubsection } from "./SettingsSection";

export function ProfileSettingsHub() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useUserProfile();
  const { rows, cloudConnected, isLoading } = useConnectionsStatus();

  const cloudLabel =
    profile?.cloud_sync_provider === "google"
      ? "Google Drive"
      : profile?.cloud_sync_provider === "yandex"
        ? "Яндекс.Диск"
        : "Облако не выбрано";

  const syncSummary = isLoading
    ? "…"
    : cloudConnected
      ? `Облако подключено · ${cloudLabel}`
      : "Только на этом устройстве";

  const hcRow = rows["health-connect"];

  return (
    <div className="space-y-5">
      <SettingsSubsection title="Аккаунт" description="Имя, вход и режим данных">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[rgb(var(--app-accent)/0.2)] to-[rgb(var(--app-accent)/0.05)] text-lg font-bold text-[rgb(var(--app-accent))]">
            {(profile?.effective_display_name?.trim()?.[0] ?? session?.email?.[0] ?? "F").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[rgb(var(--app-text))]">
              {profile?.effective_display_name?.trim() || session?.email || "Пользователь Forma"}
            </p>
            {session?.email ? (
              <p className="text-sm text-[rgb(var(--app-text-muted))] truncate">{session.email}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="settings-status-pill settings-status-pill--ok">
                <Cloud className="h-3.5 w-3.5" aria-hidden />
                {syncSummary}
              </span>
              {hcRow ? (
                <span
                  className={`settings-status-pill settings-status-pill--${hcRow.tone === "ok" ? "ok" : hcRow.tone === "warn" ? "warn" : "idle"}`}
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  HC: {hcRow.chip}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary text-sm inline-flex items-center gap-2 shrink-0"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Выйти
          </button>
        </div>
        <p className="text-xs text-[rgb(var(--app-text-muted))] mt-3 leading-relaxed">
          Локальный режим: данные остаются на ПК. Облако — через{" "}
          <Link to="/settings?tab=connections" className="text-[rgb(var(--app-accent))] hover:underline">
            подключения
          </Link>{" "}
          и{" "}
          <Link to="/settings?tab=sync" className="text-[rgb(var(--app-accent))] hover:underline">
            синхронизацию
          </Link>
          .
        </p>
      </SettingsSubsection>

      <ProfileSummaryCard />

      <GeneralSettings embedded showSex showWeekStart={false} showUnits={false} />

      <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed border-t border-[rgb(var(--app-border)/0.5)] pt-4">
        У тренированных людей max HR часто ниже формулы 220 − возраст — укажите значение с реальной
        нагрузки.
      </p>

      <ProfileSection />
    </div>
  );
}
