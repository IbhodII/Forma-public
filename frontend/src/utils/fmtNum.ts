/** Safe number formatting for UI — never shows NaN. */
export function fmtNum(
  n: number | null | undefined,
  digits: number,
  fallback = "—",
): string {
  if (n == null || !Number.isFinite(n)) return fallback;
  return n.toFixed(digits);
}
