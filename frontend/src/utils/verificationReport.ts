export type VerificationCheck = {
  id?: string;
  label: string;
  ok?: boolean;
  error?: string;
  detail?: string;
};

export type VerificationReport = {
  ok?: boolean;
  checks?: VerificationCheck[];
  failed?: string[];
};

export function verificationFailureLines(
  report: VerificationReport | null | undefined,
  maxLines = 4,
): string[] {
  if (!report || report.ok !== false) return [];
  const lines = (report.checks ?? [])
    .filter((c) => c.ok === false && c.error)
    .map((c) => `${c.label}: ${c.error}`);
  return lines.slice(0, maxLines);
}
