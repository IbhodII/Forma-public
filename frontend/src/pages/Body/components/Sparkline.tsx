export function Sparkline({
  values,
  color = "#3b82f6",
  className = "",
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <svg className={`body-hero-metric__spark ${className}`} viewBox="0 0 80 32" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="16" x2="80" y2="16" stroke={color} strokeOpacity={0.2} strokeWidth="1" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = max - min;
  const w = 80;
  const h = 32;
  const pad = 2;
  const chartH = h - pad * 2;

  // Стабильный ряд — не растягивать шум на всю высоту (визуальные «просадки»)
  const isNearlyFlat = spread > 0 && spread / Math.max(Math.abs(avg), 1) < 0.04;
  const range = isNearlyFlat ? spread || 1 : spread || 1;
  const midY = h / 2;

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = isNearlyFlat
        ? midY
        : h - pad - ((v - min) / range) * chartH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className={`body-hero-metric__spark ${className}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
