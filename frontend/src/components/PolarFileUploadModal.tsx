import { useRef, useState } from "react";
import { ModalShell } from "./ui/modal";

const ACCEPT = ".tcx,.gpx,.fit,application/gpx+xml,application/tcx+xml,application/vnd.ant.fit";

interface PolarFileUploadModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
}

export function PolarFileUploadModal({
  open,
  loading,
  onClose,
  onUpload,
}: PolarFileUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const ext = next.name.toLowerCase().split(".").pop() ?? "";
    if (!["tcx", "gpx", "fit"].includes(ext)) {
      setFile(null);
      return;
    }
    setFile(next);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0] ?? null);
  };

  const resetAndClose = () => {
    setFile(null);
    setDragOver(false);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={resetAndClose}
      title="Импорт тренировки из файла"
      description="Поддерживаются форматы TCX, GPX и FIT (экспорт из Polar Flow или других сервисов)."
      size="md"
      zIndex={50}
      footer={
        <>
          <button type="button" onClick={resetAndClose} className="btn-secondary" disabled={loading}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            disabled={!file || loading}
            onClick={() => file && onUpload(file)}
          >
            {loading && (
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
            )}
            {loading ? "Загрузка…" : "Загрузить"}
          </button>
        </>
      }
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
            : "border-slate-300 dark:border-slate-600 hover:border-brand-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="text-sm font-medium text-[rgb(var(--app-text))]">{file.name}</p>
        ) : (
          <>
            <p className="text-sm text-[rgb(var(--app-text))]">
              Перетащите файл сюда или нажмите для выбора
            </p>
            <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1">.tcx · .gpx · .fit</p>
          </>
        )}
      </div>
    </ModalShell>
  );
}
