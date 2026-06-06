import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { buildMiniDatabase, downloadMiniDatabaseResult, type MiniDbBuildResponse } from "../../../api/miniDatabase";
import { useToast } from "../../../components/Toast";
import { parseApiError } from "../../../utils/validation";
import { resolveClientMode } from "../../../config/clientCapabilities";
import { SettingsSubsection } from "./SettingsSection";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function MiniDatabasePanel() {
  const { showToast } = useToast();
  const [last, setLast] = useState<MiniDbBuildResponse | null>(null);

  const buildMut = useMutation({
    mutationFn: async () => {
      const res = await buildMiniDatabase();
      await downloadMiniDatabaseResult(res.export_id, res.download_filename);
      return res;
    },
    onSuccess: (res) => {
      setLast(res);
      showToast(
        res.ok
          ? "Тестовая mini-база создана и скачана"
          : "Mini-база создана, но есть предупреждения в проверке",
        res.ok ? "success" : "error",
      );
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const report = last?.report;
  const clientMode = resolveClientMode();

  return (
    <SettingsSubsection
      title="Тестовая mini-база"
      description="Создаёт уменьшенную копию текущей БД (ZIP для импорта). Оригинальные workouts.db и shared.db не изменяются."
    >
      <p className="text-xs text-[rgb(var(--app-text-muted))] mb-2 leading-relaxed">
        Включает профиль, последние {8} силовых сессий, кардио и вес/замеры за ~30 дней, питание за ~7
        дней, шаги/сон/пульс (если есть), нужные справочники продуктов. Формат совместим с импортом БД
        (forma_db_zip_v1 + manifest). Исходная база не изменяется.
      </p>
      <p className="text-[10px] text-[rgb(var(--app-text-muted))] mb-3">
        Режим клиента: <span className="font-mono">{clientMode}</span>
        {clientMode === "admin_browser"
          ? " · доступно в dev-браузере"
          : clientMode === "desktop_app"
            ? " · desktop"
            : " · для mini-базы нужен admin_browser или desktop_app"}
      </p>

      <button
        type="button"
        className="btn-primary text-sm"
        disabled={buildMut.isPending}
        onClick={() => buildMut.mutate()}
      >
        {buildMut.isPending ? "Создание mini-базы…" : "Создать тестовую мини-базу"}
      </button>

      {report ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[rgb(var(--app-border)/0.55)] bg-[rgb(var(--app-surface-subtle)/0.25)] p-3 text-xs">
          <p className="font-medium text-[rgb(var(--app-text))]">
            Сжатие: {formatBytes(report.source_workouts_bytes + report.source_shared_bytes)} →{" "}
            {formatBytes(report.zip_bytes)} ZIP
          </p>
          <p className="text-[rgb(var(--app-text-muted))]">
            Силовых сессий: {report.strength_sessions.length} · строк strength_workouts:{" "}
            {report.row_counts.strength_workouts ?? 0} · food_entries:{" "}
            {report.row_counts.food_entries ?? 0}
          </p>
          <ul className="space-y-1">
            {report.checks.map((c) => (
              <li
                key={c.id}
                className={c.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}
              >
                {c.ok ? "✓" : "⚠"} {c.label}
                {c.detail ? ` — ${c.detail}` : ""}
                {c.error ? ` (${c.error})` : ""}
              </li>
            ))}
          </ul>
          {report.errors.length > 0 ? (
            <p className="text-amber-700 dark:text-amber-300">{report.errors.join("; ")}</p>
          ) : null}
        </div>
      ) : null}
    </SettingsSubsection>
  );
}
