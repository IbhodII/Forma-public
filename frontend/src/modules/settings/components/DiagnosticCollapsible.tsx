import { ChevronDown } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { useToast } from "../../../components/Toast";

export function CopyDebugJsonButton({ data, label = "Копировать JSON" }: { data: unknown; label?: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      showToast("JSON скопирован", "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Не удалось скопировать", "error");
    }
  }, [data, showToast]);

  return (
    <button type="button" className="btn-secondary text-xs" onClick={() => void copy()}>
      {copied ? "Скопировано" : label}
    </button>
  );
}

export function DiagnosticCollapsible({
  title,
  description,
  defaultOpen = false,
  copyData,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  copyData?: unknown;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-[rgb(var(--app-border)/0.55)]" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[rgb(var(--app-text))]">{title}</div>
          {description ? (
            <p className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">{description}</p>
          ) : null}
        </div>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-[rgb(var(--app-border)/0.55)] px-4 py-4">
        {copyData != null ? (
          <div className="flex justify-end">
            <CopyDebugJsonButton data={copyData} />
          </div>
        ) : null}
        {children}
      </div>
    </details>
  );
}

export function DebugJsonPreview({
  data,
  defaultOpen = false,
  label = "Показать raw JSON",
}: {
  data: unknown;
  defaultOpen?: boolean;
  label?: string;
}) {
  if (data == null) {
    return <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет данных</p>;
  }

  return (
    <details className="rounded-lg border border-[rgb(var(--app-border)/0.5)]" open={defaultOpen}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[rgb(var(--app-text-muted))]">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-[rgb(var(--app-border)/0.5)] p-3 font-mono text-xs whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
