import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  fetchBackupSettings,
  runBackupNow,
  saveBackupSettings,
} from "../../../api/user";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { SettingsSubsection } from "./SettingsSection";

function formatBackupDate(iso: string | null | undefined): string {
  if (!iso) return "ещё не создавался";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LocalBackupSettings() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.backupSettings,
    queryFn: fetchBackupSettings,
  });

  const [backupPath, setBackupPath] = useState("");

  useEffect(() => {
    if (data === undefined) return;
    setBackupPath(data.backup_folder_path ?? "");
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => saveBackupSettings(backupPath.trim() || null),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.backupSettings, saved);
      setBackupPath(saved.backup_folder_path ?? "");
      showToast("Папка для бэкапов сохранена", "success");
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  const backupMut = useMutation({
    mutationFn: runBackupNow,
    onSuccess: async (res) => {
      showToast(`Бэкап создан: ${res.backup_name ?? "forma_db.zip"}`, "success");
      await qc.invalidateQueries({ queryKey: queryKeys.backupSettings });
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  return (
    <SettingsSubsection
      title="Автоматическое резервное копирование"
      description="Раз в месяц ZIP с workouts.db и shared.db в указанную папку."
    >
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed mb-3">
        Укажите путь к папке на диске (например, <code className="text-xs">C:\Backups</code>).
        Создаётся файл <code className="text-xs">forma_db_YYYY-MM-DD.zip</code> с обеими базами.
        При запуске API проверка выполняется ежедневно; новый архив — если с прошлого бэкапа
        прошло около месяца.
      </p>

      <label className="block text-sm font-medium mb-1" htmlFor="backup-folder-path">
        Папка для бэкапов
      </label>
      <input
        id="backup-folder-path"
        type="text"
        className="input-field w-full mb-2"
        placeholder="C:\Backups или D:\MyHealth\Backups"
        value={backupPath}
        onChange={(e) => setBackupPath(e.target.value)}
        disabled={isLoading || saveMut.isPending}
      />

      <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3">
        Последний бэкап: {formatBackupDate(data?.last_backup_date)}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Сохранение…" : "Сохранить путь"}
        </button>
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={backupMut.isPending || !backupPath.trim()}
          onClick={() => backupMut.mutate()}
        >
          {backupMut.isPending ? "Создание…" : "Сделать бэкап сейчас"}
        </button>
      </div>
    </SettingsSubsection>
  );
}
