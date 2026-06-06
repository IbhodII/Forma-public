import type {TextStyle} from 'react-native';

import type {DSColors} from './tokens';
import {typography} from './tokens';

export type HeroTextStyles = {
  overline: TextStyle;
  title: TextStyle;
  subtitle: TextStyle;
  body: TextStyle;
  muted: TextStyle;
};

export function getHeroTextStyles(colors: DSColors): HeroTextStyles {
  return {
    overline: {
      ...typography.overline,
      color: colors.heroTextOverline,
    },
    title: {
      color: colors.heroText,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.heroTextSecondary,
      lineHeight: 20,
    },
    body: {
      color: colors.heroTextSecondary,
      lineHeight: 22,
    },
    muted: {
      color: colors.heroTextMuted,
      lineHeight: 18,
    },
  };
}
