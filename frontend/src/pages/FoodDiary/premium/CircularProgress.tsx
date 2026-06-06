import { motion } from "framer-motion";
import { cn } from "../../../lib/utils";

export function CircularProgress({
  value,
  max,
  size = 88,
  stroke = 7,
  accentClass = "text-emerald-500",
  trackClass = "text-slate-200/80 dark:text-slate-700/60",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  accentClass?: string;
  trackClass?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={trackClass}
          stroke="currentColor"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(accentClass)}
          stroke="currentColor"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex max-w-[85%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center leading-none">
        {children}
      </div>
    </div>
  );
}
