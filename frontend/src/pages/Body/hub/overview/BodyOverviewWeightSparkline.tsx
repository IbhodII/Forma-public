/** Широкий sparkline на всю карточку (30 дней), цвет линии настраивается. */
export function BodyOverviewWeightSparkline({
  values,
  color = "#10b981",
}: {
  values: number[];
  color?: string;
}) {
  const w = 400;
  const h = 96;
  const padX = 4;
  const padY = 8;
  const chartH = h - padY * 2;

  if (values.length < 2) {
    return (
      <svg
        className="body-overview-weight-mini__spark-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1={padX}
          y1={h / 2}
          x2={w - padX}
          y2={h / 2}
          stroke={color}
          strokeOpacity={0.25}
          strokeWidth="1"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const points = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (w - padX * 2);
    const y = h - padY - ((v - min) / spread) * chartH;
    return { x, y };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = [
    `${points[0].x},${h - padY}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${h - padY}`,
  ].join(" ");

  return (
    <svg
      className="body-overview-weight-mini__spark-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="body-weight-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#body-weight-spark-fill)" />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={linePoints}
      />
    </svg>
  );
}
