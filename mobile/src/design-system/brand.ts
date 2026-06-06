import type {ResolvedTheme} from '../context/ThemeContext';
import type {DSColors} from './tokens';

/** Forma — calm athletic intelligence */
export const BRAND = {
  name: 'Forma',
  monogram: 'F',
} as const;

export type ChartSeries = {
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  neutral: string;
  zones: readonly string[];
};

export function getChartSeries(colors: DSColors): ChartSeries {
  return {
    primary: colors.stateTraining,
    secondary: colors.stateAnalytics,
    tertiary: colors.accentWarm,
    quaternary: colors.stateRecovery,
    neutral: colors.textMuted,
    zones: [
      colors.stateRecovery,
      colors.accent,
      colors.stateAnalytics,
      colors.accentWarm,
      colors.danger,
    ],
  };
}

export type HeroStops = {
  start: string;
  mid: string;
  end: string;
  orbA: string;
  orbB: string;
};

export function getHeroStops(colors: DSColors): HeroStops {
  return {
    start: colors.heroStart,
    mid: colors.heroMid,
    end: colors.heroEnd,
    orbA: colors.glow,
    orbB: colors.accentSecondary,
  };
}

/** Semantic tint for workload / recovery copy */
export function workloadAccent(
  status: 'fresh' | 'balanced' | 'loaded' | 'fatigued' | 'unknown',
  colors: DSColors,
): string {
  switch (status) {
    case 'fresh':
      return colors.stateRecovery;
    case 'balanced':
      return colors.accent;
    case 'loaded':
      return colors.accentWarm;
    case 'fatigued':
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

export const brandRadius = {
  card: 16,
  hero: 18,
  button: 14,
  fab: 18,
} as const;
