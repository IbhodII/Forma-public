export const BODY_METRIC_DECIMALS = 2;

export function formatBodyMetricValue(
  value: number | null | undefined,
  suffix = '',
): string {
  if (value == null || Number.isNaN(Number(value)) || value <= 0) {
    return '—';
  }
  const n = Number(value);
  const factor = 10 ** BODY_METRIC_DECIMALS;
  const rounded = Math.round(n * factor) / factor;
  if (Number.isInteger(rounded)) {
    return `${rounded}${suffix}`;
  }
  const s = rounded
    .toFixed(BODY_METRIC_DECIMALS)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `${s}${suffix}`;
}

export function formatBodyMetricSigned(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) {
    return '0';
  }
  const sign = n > 0 ? '+' : '-';
  const abs = formatBodyMetricValue(Math.abs(n));
  return abs === '—' ? '—' : `${sign}${abs}`;
}
