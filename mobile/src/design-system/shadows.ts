import {StyleSheet, type ViewStyle} from 'react-native';

import type {DSColors} from './tokens';

export function createShadows(colors: DSColors, isDark: boolean) {
  if (!isDark) {
    const baseOpacity = 0.09;
    const glowOpacity = 0.28;
    return StyleSheet.create({
      none: {},
      sm: {
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: baseOpacity,
        shadowRadius: 8,
        elevation: 2,
      } as ViewStyle,
      md: {
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: 6},
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 5,
      } as ViewStyle,
      lg: {
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: 12},
        shadowOpacity: 0.14,
        shadowRadius: 28,
        elevation: 10,
      } as ViewStyle,
      tabBar: {
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 8,
      } as ViewStyle,
      tabBarFloat: {
        shadowColor: colors.shadow,
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 12,
      } as ViewStyle,
      cta: {
        shadowColor: colors.glow,
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: glowOpacity,
        shadowRadius: 18,
        elevation: 8,
      } as ViewStyle,
      glow: {
        shadowColor: colors.glow,
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: glowOpacity,
        shadowRadius: 14,
        elevation: 6,
      } as ViewStyle,
    card: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 3},
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    } as ViewStyle,
      fab: {
        shadowColor: colors.glow,
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: glowOpacity,
        shadowRadius: 18,
        elevation: 10,
      } as ViewStyle,
    });
  }

  /** Dark: colored ambient lift — cards float on ink, not harsh black drops */
  return StyleSheet.create({
    none: {},
    sm: {
      shadowColor: colors.glow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 2,
    } as ViewStyle,
    md: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.55,
      shadowRadius: 20,
      elevation: 6,
    } as ViewStyle,
    lg: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 16},
      shadowOpacity: 0.65,
      shadowRadius: 32,
      elevation: 12,
    } as ViewStyle,
    tabBar: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: -4},
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    } as ViewStyle,
    tabBarFloat: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 8},
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 12,
    } as ViewStyle,
    cta: {
      shadowColor: colors.glow,
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: 0.35,
      shadowRadius: 22,
      elevation: 10,
    } as ViewStyle,
    glow: {
      shadowColor: colors.glow,
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 8,
    } as ViewStyle,
    card: {
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 2,
    } as ViewStyle,
    fab: {
      shadowColor: colors.glow,
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: 0.38,
      shadowRadius: 22,
      elevation: 12,
    } as ViewStyle,
  });
}

export type DSShadows = ReturnType<typeof createShadows>;
