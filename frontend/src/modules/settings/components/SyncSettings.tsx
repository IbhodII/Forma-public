import { Link } from "react-router-dom";
import { SourcePrioritySettings } from "./SourcePrioritySettings";
import { CollapsibleSection } from "./CollapsibleSection";

/** Правила слияния данных; FormaSync и облако — во вкладке «Данные». */
export function SyncSettings() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed max-w-2xl">
        Здесь — приоритет источников (пульс, шаги, GPS). FormaSync, облачный бэкап и OAuth — в{" "}
        <Link to="/settings?tab=data&panel=cloud" className="text-[rgb(var(--app-accent))] hover:underline">
          Данные → Облако
        </Link>
        . Подключение аккаунтов — в{" "}
        <Link to="/settings?tab=connections" className="text-[rgb(var(--app-accent))] hover:underline">
          Подключения
        </Link>
        .
      </p>

      <CollapsibleSection
        title="Приоритет источников"
        description="Какой источник использовать для пульса, шагов, GPS и калорий"
        defaultOpen={false}
        embedded
      >
        <SourcePrioritySettings />
      </CollapsibleSection>
    </div>
  );
}
