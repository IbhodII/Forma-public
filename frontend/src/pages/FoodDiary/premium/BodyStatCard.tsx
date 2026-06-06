import { motion } from "framer-motion";
import { cn } from "../../../lib/utils";
import type { BodyStatItem } from "../useBodyContextPanel";
import { MiniSparkline } from "./MiniSparkline";

const TONE_CLASS: Record<BodyStatItem["trend"]["tone"], string> = {
  up: "text-rose-500 dark:text-rose-400",
  down: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-slate-400",
};

export function BodyStatCard({
  item,
  index,
}: {
  item: BodyStatItem;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      title={item.tooltip}
      className={cn(
        "group relative flex w-full min-w-0 flex-col gap-1 rounded-xl",
        "border border-slate-300/70 bg-white/80 px-3 py-2.5 shadow-sm",
        "transition-colors hover:border-slate-400/80 hover:bg-white",
        "dark:border-slate-600/60 dark:bg-slate-900/55 dark:hover:bg-slate-900/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {item.label}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full opacity-60"
          style={{ backgroundColor: item.sparkColor }}
          aria-hidden
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">
            {item.value}
            {item.subValue && (
              <span className="ml-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                {item.subValue}
              </span>
            )}
          </p>
          <p className={cn("mt-1 text-[10px] font-medium tabular-nums", TONE_CLASS[item.trend.tone])}>
            {item.trend.label}
          </p>
        </div>
        {item.sparkline.length >= 2 ? (
          <div className="opacity-50 transition-opacity group-hover:opacity-90">
            <MiniSparkline values={item.sparkline} color={item.sparkColor} />
          </div>
        ) : item.sparkEmptyHint ? (
          <p className="max-w-[4.5rem] text-right text-[9px] leading-tight text-slate-400 dark:text-slate-500">
            {item.sparkEmptyHint}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
