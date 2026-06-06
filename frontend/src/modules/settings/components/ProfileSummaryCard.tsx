import { Loader } from "../../../components/Loader";
import { useUserProfile } from "../../../hooks/useUserProfile";
import { useUnits } from "../../../hooks/useUnits";
import { formatDateRu } from "../../../utils/format";

export function ProfileSummaryCard() {
  const { data, isLoading } = useUserProfile();
  const { formatHeight } = useUnits();

  if (isLoading && !data) {
    return <Loader label="Профиль…" />;
  }

  if (!data) return null;

  const sexLabel = data.sex === "female" ? "Женский" : "Мужской";
  const weekLabel = data.week_start_label ?? "—";
  const unitsLabel = data.units_system === "american" ? "Американская" : "Метрическая";

  return (
    <div className="settings-profile-card">
      <div className="settings-profile-stat">
        <p className="settings-profile-stat__label">Пол</p>
        <p className="settings-profile-stat__value">{sexLabel}</p>
      </div>
      <div className="settings-profile-stat">
        <p className="settings-profile-stat__label">Неделя с</p>
        <p className="settings-profile-stat__value capitalize">{weekLabel}</p>
      </div>
      <div className="settings-profile-stat">
        <p className="settings-profile-stat__label">Рост</p>
        <p className="settings-profile-stat__value">
          {data.height_cm != null ? formatHeight(data.height_cm) : "—"}
        </p>
      </div>
      <div className="settings-profile-stat">
        <p className="settings-profile-stat__label">Max HR</p>
        <p className="settings-profile-stat__value">{data.effective_max_heart_rate} уд/мин</p>
      </div>
      <div className="settings-profile-stat col-span-2 sm:col-span-4">
        <p className="settings-profile-stat__label">Имя / дата рождения</p>
        <p className="settings-profile-stat__value">
          {data.effective_display_name ?? "—"}
          {data.date_of_birth
            ? ` · ${formatDateRu(data.date_of_birth)}`
            : ""}
          {" · "}
          {unitsLabel}
        </p>
      </div>
    </div>
  );
}
