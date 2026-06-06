type Props = {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
};

export function CycleProgressRing({ value, size = 128, label, sublabel }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="relative inline-flex flex-col items-center" role="img" aria-label={`Цикл ${clamped}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#cycle-ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="cycle-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(350 55% 72%)" />
            <stop offset="100%" stopColor="hsl(270 40% 68%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && (
          <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--cycle-muted))]">{label}</span>
        )}
        <span className="text-2xl font-semibold tabular-nums text-[hsl(var(--cycle-ink))]">
          {clamped}%
        </span>
        {sublabel && <span className="text-xs text-[hsl(var(--cycle-muted))] mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}
