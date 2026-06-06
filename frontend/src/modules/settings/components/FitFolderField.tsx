import { useMemo } from "react";

export function FitFolderField({
  value,
  onChange,
  effectivePath,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  effectivePath?: string | null;
  disabled?: boolean;
}) {
  const trimmed = value.trim();
  const status = useMemo(() => {
    if (effectivePath) return "ok" as const;
    if (trimmed) return "pending" as const;
    return "empty" as const;
  }, [effectivePath, trimmed]);

  const browseFolder = async () => {
    try {
      const w = window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      };
      if (!w.showDirectoryPicker) {
        alert(
          "Браузер не даёт передать полный путь на сервер. Введите путь вручную (например E:\\fit activity).",
        );
        return;
      }
      const handle = await w.showDirectoryPicker();
      onChange(handle.name);
      alert(
        `Выбрана папка «${handle.name}». Для импорта на сервере укажите полный путь к ней в поле выше и нажмите «Сохранить».`,
      );
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm space-y-2">
        <span className="font-medium text-[rgb(var(--app-text))]">Папка с FIT-файлами</span>
        <div className="settings-path-field">
          <div className="settings-path-field__input-wrap">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="E:\fit activity или ./fit_files"
              className="input-field font-mono text-sm pr-24"
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
            />
            <span
              className={`settings-path-status ${
                status === "ok" ? "settings-path-status--ok" : "settings-path-status--empty"
              }`}
            >
              {status === "ok" ? "Активен" : status === "pending" ? "Сохраните" : "Не задан"}
            </span>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={browseFolder} disabled={disabled}>
            Обзор…
          </button>
        </div>
      </label>
      {effectivePath ? (
        <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed">
          Импорт использует:{" "}
          <code className="font-mono text-[11px] text-[rgb(var(--app-text))] break-all">{effectivePath}</code>
        </p>
      ) : (
        <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed">
          Пустое поле — путь по умолчанию (<code className="text-[11px]">./fit_files</code> или{" "}
          <code className="text-[11px]">E:\fit activity</code>).
        </p>
      )}
    </div>
  );
}
