import type { PolarAttachResponse } from "../api/polar";

type ToastKind = "success" | "error" | "info" | "warning";

/** Diagnostic lines for Polar attach pipeline (temporary debug). */
export function formatPolarAttachDebug(res: PolarAttachResponse): string {
  const lines: string[] = [
    `Polar HR samples received: ${res.hr_samples_received ?? "—"}`,
    `Parsed: ${res.hr_samples_parsed ?? "—"}`,
    `Saved HR rows: ${res.hr_samples_inserted ?? res.hr_samples ?? "—"}`,
  ];
  if (res.hr_parser_source) {
    lines.push(`Parser: ${res.hr_parser_source}`);
  }
  if (res.warnings?.length) {
    lines.push(`Warnings: ${res.warnings.join("; ")}`);
  }
  return lines.join("\n");
}

/** User-facing toast after Polar attach completes. */
export function polarAttachToast(
  res: PolarAttachResponse,
): { message: string; kind: ToastKind; debug?: string } {
  let message: string;
  let kind: ToastKind;

  if (res.has_hr_chart) {
    if (res.hr_samples > 0) {
      message = `Данные Polar привязаны (${res.hr_samples} точек пульса)`;
      kind = "success";
    } else {
      message = "Данные Polar привязаны";
      kind = "success";
    }
  } else {
    message = "Привязано. График пульса недоступен — нет посекундных данных Polar.";
    kind = "warning";
  }

  const hasDebug =
    res.hr_samples_received != null ||
    res.hr_samples_parsed != null ||
    res.hr_samples_inserted != null ||
    res.hr_parser_source ||
    (res.warnings?.length ?? 0) > 0;

  const debug = hasDebug ? formatPolarAttachDebug(res) : undefined;
  if (debug && kind === "success" && (res.warnings?.length ?? 0) > 0) {
    kind = "info";
  }

  return { message, kind, debug };
}

export const POLAR_HR_CHART_UNAVAILABLE =
  "Сводка пульса есть, график недоступен — нет посекундных данных Polar.";
