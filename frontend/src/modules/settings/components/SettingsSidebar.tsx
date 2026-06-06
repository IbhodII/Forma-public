import { useT } from "../../../i18n";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "../constants";

export function SettingsSidebar({
  active,
  onChange,
  hiddenIds = [],
}: {
  active: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
  hiddenIds?: SettingsSectionId[];
}) {
  const t = useT();
  const items = SETTINGS_SECTIONS.filter((s) => !hiddenIds.includes(s.id));

  return (
    <nav className="settings-sidebar" aria-label="Разделы настроек">
      <ul className="settings-sidebar__list" role="tablist">
        {items.map((section) => {
          const isActive = section.id === active;
          return (
            <li key={section.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(section.id)}
                className={`settings-sidebar__btn ${isActive ? "settings-sidebar__btn--active" : ""}`}
              >
                <span className="settings-sidebar__icon" aria-hidden>
                  {section.icon}
                </span>
                <span className="min-w-0">
                  <span className="block">{t(section.labelKey)}</span>
                  <span className="hidden xl:block text-[11px] font-normal opacity-70 truncate">
                    {t(section.descriptionKey)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
