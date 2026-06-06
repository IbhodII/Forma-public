import { useTheme, type ThemeMode } from "../../../contexts/ThemeContext";
import { GeneralSettings } from "./GeneralSettings";
import { SettingsSubsection } from "./SettingsSection";

const THEME_OPTIONS: { id: ThemeMode; label: string; hint: string }[] = [
  { id: "light", label: "Светлая", hint: "Дневной режим" },
  { id: "dark", label: "Тёмная", hint: "Вечерний режим" },
  { id: "system", label: "Системная", hint: "Как в ОС" },
];

export function InterfaceHub() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      <SettingsSubsection title="Тема" description="Сохраняется в браузере для всего приложения">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 rounded-xl bg-[rgb(var(--app-subtab-track))]">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-left ${
                theme === opt.id
                  ? "bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)] text-[rgb(var(--app-text))] ring-1 ring-[rgb(var(--app-accent)/0.2)]"
                  : "text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]"
              }`}
            >
              {opt.label}
              <span className="block text-xs font-normal opacity-80 mt-0.5">{opt.hint}</span>
            </button>
          ))}
        </div>
      </SettingsSubsection>

      <SettingsSubsection title="Единицы измерения" description="Метрическая или экспериментальная американская">
        <GeneralSettings embedded showSex={false} showWeekStart={false} showUnits />
      </SettingsSubsection>

    </div>
  );
}
