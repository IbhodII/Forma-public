import {
  Activity,
  CircleDot,
  Dumbbell,
  HeartPulse,
  Hexagon,
  Layers,
  Orbit,
  Shapes,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { WorkoutIconKey, WorkoutVisual } from "../../utils/workoutVisuals";
import { cn } from "../../lib/utils";

const ICON_MAP: Record<WorkoutIconKey, LucideIcon> = {
  dumbbell: Dumbbell,
  activity: Activity,
  layers: Layers,
  zap: Zap,
  "heart-pulse": HeartPulse,
  sparkles: Sparkles,
  orbit: Orbit,
  hexagon: Hexagon,
  shapes: Shapes,
  "circle-dot": CircleDot,
};

const STROKE = 1.75;

const SIZE = {
  xs: { box: "h-8 w-8 rounded-xl", icon: 15 },
  sm: { box: "h-10 w-10 rounded-xl", icon: 18 },
  md: { box: "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl", icon: 22 },
  lg: { box: "h-16 w-16 rounded-2xl", icon: 28 },
} as const;

export function WorkoutCategoryIcon({
  visual,
  size = "md",
  className,
  iconClassName,
  "aria-hidden": ariaHidden = true,
}: {
  visual: WorkoutVisual;
  size?: keyof typeof SIZE;
  className?: string;
  iconClassName?: string;
  "aria-hidden"?: boolean;
}) {
  const Icon = ICON_MAP[visual.icon] ?? Dumbbell;
  const dim = SIZE[size];

  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-center bg-gradient-to-br ring-1",
        dim.box,
        visual.accentClass,
        visual.ringClass,
        className,
      )}
      aria-hidden={ariaHidden}
    >
      <Icon
        size={dim.icon}
        strokeWidth={STROKE}
        className={cn(visual.iconClass, iconClassName)}
        aria-hidden
      />
    </div>
  );
}

export function getWorkoutLucideIcon(key: WorkoutIconKey): LucideIcon {
  return ICON_MAP[key] ?? Dumbbell;
}
