import {useMemo} from 'react';

import {useAppTheme} from '../context/ThemeContext';
import {BRAND, getChartSeries, getHeroStops, type ChartSeries, type HeroStops} from './brand';
import {getHeroTextStyles, type HeroTextStyles} from './heroTypography';
import {createShadows, type DSShadows} from './shadows';
import {
  getColors,
  iconSize,
  layout,
  legacyTypography,
  motion,
  radius,
  space,
  spacing,
  typography,
  touch,
  type DSColors,
  type TypeVariant,
} from './tokens';

export function useDesignSystem() {
  const {resolvedTheme, mode, setMode} = useAppTheme();
  const colors = useMemo(() => getColors(resolvedTheme), [resolvedTheme]);
  const isDark = resolvedTheme === 'dark';
  const shadows = useMemo(() => createShadows(colors, isDark), [colors, isDark]);
  const chart = useMemo(() => getChartSeries(colors), [colors]);
  const hero = useMemo(() => getHeroStops(colors), [colors]);
  const heroText = useMemo(() => getHeroTextStyles(colors), [colors]);

  return {
    theme: resolvedTheme,
    isDark,
    mode,
    setMode,
    brand: BRAND,
    colors,
    chart,
    hero,
    heroText,
    space,
    spacing,
    radius,
    layout,
    iconSize,
    motion,
    typography,
    legacyTypography,
    shadows,
    touch,
    text: (variant: TypeVariant, color?: keyof DSColors) => ({
      ...typography[variant],
      color: color ? colors[color] : colors.text,
    }),
  };
}

export type DesignSystem = ReturnType<typeof useDesignSystem>;

export function useMobileTheme() {
  const ds = useDesignSystem();
  const colors = {
    ...ds.colors,
    heroGradientStart: ds.colors.heroStart,
    heroGradientEnd: ds.colors.heroEnd,
    dangerBg: ds.colors.dangerMuted,
  };
  return {
    ...ds,
    colors,
    typography: ds.legacyTypography,
  };
}

export type {ChartSeries, HeroStops, HeroTextStyles};
