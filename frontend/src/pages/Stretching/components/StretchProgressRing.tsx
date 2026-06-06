type Props = {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
};

export function StretchProgressRing({
  value,
  size = 120,
  stroke = 8,
  label,
  sublabel,
  className = "",
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center ${className}`}
      role="img"
      aria-label={label ? `${label}: ${clamped}%` : `Прогресс ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/25 dark:text-white/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#stretch-ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="stretch-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(168 76% 42%)" />
            <stop offset="100%" stopColor="hsl(258 55% 62%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-[hsl(var(--stretch-ink))]">
          {clamped}
        </span>
        {label && (
          <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--stretch-muted))] mt-0.5">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-xs text-[hsl(var(--stretch-muted))] mt-1">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
