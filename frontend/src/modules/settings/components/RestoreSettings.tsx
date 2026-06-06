import { AlertTriangle } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";
import { CloudRestorePanel } from "./CloudRestorePanel";

export function RestoreSettings() {
  return (
    <CollapsibleSection
      title="Восстановление"
      description="Вернуть данные из локальной копии или из облака — с предупреждением о замене"
      defaultOpen={false}
    >
      <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="text-sm space-y-2">
          <p className="font-semibold text-amber-900 dark:text-amber-100">Осторожно с заменой данных</p>
          <ul className="text-xs text-amber-800/90 dark:text-amber-200/90 list-disc pl-4 space-y-1">
            <li>
              <strong>Восстановление из ZIP</strong> — в разделе «Резервные копии». Режим «Заменить»
              перезаписывает локальную базу.
            </li>
            <li>
              <strong>Восстановление из облака</strong> — полная замена workouts.db из файла на
              диске. После операции может потребоваться перезапуск API.
            </li>
            <li>
              Режим <strong>слияния</strong> добавляет записи, не удаляя существующие.
            </li>
          </ul>
        </div>
      </div>

      <CloudRestorePanel />
    </CollapsibleSection>
  );
}
