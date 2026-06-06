import { AlertTriangle } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  isLegacyDangerForecastError,
  parseForecastErrorLines,
} from "./formatDeficitAlert";

export function ForecastErrorAlert({
  error,
  compact = false,
}: {
  error: unknown;
  compact?: boolean;
}) {
  const lines = parseForecastErrorLines(error);
  const legacyDanger = isLegacyDangerForecastError(error);

  return (
    <div
      className={cn(
        "rounded-md border border-[rgb(var(--app-border)/0.4)] border-l-[3px]",
        compact ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-2 text-xs",
        "space-y-1 leading-snug",
        legacyDanger
          ? "border-l-rose-500 text-rose-900 dark:text-rose-100"
          : "border-l-red-500 text-red-800 dark:text-red-200",
      )}
      role="alert"
    >
      {lines.map((line, i) => (
        <p key={i} className={cn(i === 0 && legacyDanger && "flex items-start gap-1.5 font-medium")}>
          {i === 0 && legacyDanger ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{line}</span>
            </>
          ) : (
            line
          )}
        </p>
      ))}
      {legacyDanger ? (
        <p className="text-[10px] text-[rgb(var(--app-text-muted))] pl-5">
          График недоступен — перезапустите API через start.ps1.
        </p>
      ) : null}
    </div>
  );
}
