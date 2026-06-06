import {DarkTheme, DefaultTheme, type Theme} from '@react-navigation/native';

import type {DSColors} from './tokens';

export function createNavigationTheme(colors: DSColors, isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bgElevated,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };
}
