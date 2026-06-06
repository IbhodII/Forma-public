import type {ResolvedTheme} from '../context/ThemeContext';
import type {TextStyle} from 'react-native';

/**
 * Forma design system — premium wellness & performance companion.
 *
 * UI contract (single source — do not duplicate in screens):
 * - Card/button radius: radius.md (14)
 * - Sheet radius: radius.lg (16)
 * - Screen padding X: layout.screenPaddingX
 * - List gap: layout.blockGap (12) or blockGapCompact (8)
 * - Card padding: layout.cardPadding (16) via AppCard padding="md"
 * - Floating tab bar: layout.tabBarFloatMarginH/B, tabBarRadius
 * - Touch min: layout.buttonMinHeight (44), list rows listItemMinHeight (48)
 * - Tab clearance: TAB_BAR_CLEARANCE (chrome only; AppScreen adds safe-area)
 * - Hero copy: colors.heroText* + useDesignSystem().heroText styles
 * - Long descriptions: body + textSecondary (line-height 22), not textMuted
 */
import {TAB_BAR_CLEARANCE} from '../navigation/tabBarMetrics';

export type DSColors = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;
  /** Top-edge luminance on cards */
  surfaceHighlight: string;
  /** Semi-opaque surface for floating tab bar chrome. */
  surfaceGlass: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentMuted: string;
  accentText: string;
  accentSecondary: string;
  accentWarm: string;
  danger: string;
  dangerMuted: string;
  dangerText: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  /** Brand glow for shadows & highlights */
  glow: string;
  /** Recovery / readiness */
  stateRecovery: string;
  stateRecoveryMuted: string;
  /** Strength & session intensity */
  stateTraining: string;
  stateTrainingMuted: string;
  /** Analytics & insights */
  stateAnalytics: string;
  stateAnalyticsMuted: string;
  /** Cycle, body, nourishment */
  stateWellness: string;
  stateWellnessMuted: string;
  heroStart: string;
  heroMid: string;
  heroEnd: string;
  /** Text on hero gradients */
  heroText: string;
  heroTextSecondary: string;
  heroTextMuted: string;
  heroTextOverline: string;
  heroScrim: string;
  /** Muted chip on hero gradient backgrounds */
  heroChipBg: string;
  overlay: string;
  /** Legacy tab bar fill; prefer surfaceGlass for floating dock. */
  tabBar: string;
  tabBarBorder: string;
  shadow: string;
  focusRing: string;
  /** Screen-top ambient wash (dark) */
  ambientStart: string;
  ambientEnd: string;
  /** Analytics chart inset */
  chartWell: string;
  chartGrid: string;
};

const lightColors: DSColors = {
  bg: '#F1F5FA',
  bgElevated: '#F7FAFD',
  surface: '#FFFFFF',
  surfaceMuted: '#E8EEF6',
  surfacePressed: '#DCE4EF',
  surfaceHighlight: 'rgba(255, 255, 255, 0.92)',
  surfaceGlass: 'rgba(255, 255, 255, 0.94)',
  border: 'rgba(12, 28, 48, 0.11)',
  borderStrong: 'rgba(12, 28, 48, 0.2)',
  text: '#0A1422',
  textSecondary: '#1F3147',
  textMuted: '#32475E',
  textInverse: '#F8FFFE',
  accent: '#0A9A8C',
  accentMuted: 'rgba(10, 154, 140, 0.16)',
  accentText: '#F8FFFE',
  accentSecondary: '#4E67A8',
  accentWarm: '#B87A52',
  danger: '#C93D4A',
  dangerMuted: 'rgba(201, 61, 74, 0.1)',
  dangerText: '#8B1E2A',
  success: '#1F9A7A',
  successMuted: 'rgba(31, 154, 122, 0.11)',
  warning: '#C07A2A',
  warningMuted: 'rgba(192, 122, 42, 0.16)',
  glow: 'rgba(10, 154, 140, 0.32)',
  stateRecovery: '#1A9A88',
  stateRecoveryMuted: 'rgba(26, 154, 136, 0.12)',
  stateTraining: '#0A9A8C',
  stateTrainingMuted: 'rgba(10, 154, 140, 0.13)',
  stateAnalytics: '#5A6BB5',
  stateAnalyticsMuted: 'rgba(90, 107, 181, 0.12)',
  stateWellness: '#B87A52',
  stateWellnessMuted: 'rgba(184, 122, 82, 0.12)',
  heroStart: '#0A5C56',
  heroMid: '#0C3D5C',
  heroEnd: '#101A2E',
  heroText: '#FFFFFF',
  heroTextSecondary: 'rgba(255, 255, 255, 0.94)',
  heroTextMuted: 'rgba(255, 255, 255, 0.82)',
  heroTextOverline: 'rgba(255, 255, 255, 0.88)',
  heroScrim: 'rgba(0, 0, 0, 0.35)',
  heroChipBg: 'rgba(255, 255, 255, 0.14)',
  overlay: 'rgba(10, 20, 34, 0.52)',
  tabBar: 'rgba(255, 255, 255, 0.96)',
  tabBarBorder: 'rgba(10, 154, 140, 0.2)',
  shadow: '#0C1828',
  focusRing: 'rgba(10, 154, 140, 0.42)',
  ambientStart: 'transparent',
  ambientEnd: 'transparent',
  chartWell: '#EAF0F7',
  chartGrid: 'rgba(12, 28, 48, 0.12)',
};

/** Flagship wellness dark — layered ink, soft jade light, cinematic depth */
const darkColors: DSColors = {
  bg: '#0B0F17',
  bgElevated: '#0F1520',
  surface: '#151D2B',
  surfaceMuted: '#1A2436',
  surfacePressed: '#212D42',
  surfaceHighlight: 'rgba(186, 214, 232, 0.09)',
  surfaceGlass: 'rgba(16, 24, 38, 0.86)',
  border: 'rgba(130, 160, 190, 0.1)',
  borderStrong: 'rgba(130, 160, 190, 0.22)',
  text: '#E6EDF5',
  textSecondary: '#A8BDD1',
  textMuted: '#8FA3B8',
  textInverse: '#0A1A18',
  accent: '#62C9BC',
  accentMuted: 'rgba(98, 201, 188, 0.12)',
  accentText: '#0A1A18',
  accentSecondary: '#8FA3D8',
  accentWarm: '#CFA882',
  danger: '#E8878F',
  dangerMuted: 'rgba(232, 135, 143, 0.14)',
  dangerText: '#FECACA',
  success: '#6BC9A8',
  successMuted: 'rgba(107, 201, 168, 0.12)',
  warning: '#D4B06A',
  warningMuted: 'rgba(212, 176, 106, 0.12)',
  glow: 'rgba(98, 201, 188, 0.22)',
  stateRecovery: '#72C4B0',
  stateRecoveryMuted: 'rgba(114, 196, 176, 0.14)',
  stateTraining: '#62C9BC',
  stateTrainingMuted: 'rgba(98, 201, 188, 0.14)',
  stateAnalytics: '#94A6D8',
  stateAnalyticsMuted: 'rgba(148, 166, 216, 0.14)',
  stateWellness: '#CFA882',
  stateWellnessMuted: 'rgba(207, 168, 130, 0.14)',
  heroStart: '#0D3D42',
  heroMid: '#152A45',
  heroEnd: '#0A0E16',
  heroText: '#FFFFFF',
  heroTextSecondary: 'rgba(255, 255, 255, 0.94)',
  heroTextMuted: 'rgba(255, 255, 255, 0.82)',
  heroTextOverline: 'rgba(255, 255, 255, 0.88)',
  heroScrim: 'rgba(0, 0, 0, 0.42)',
  heroChipBg: 'rgba(255, 255, 255, 0.12)',
  overlay: 'rgba(4, 8, 14, 0.72)',
  tabBar: 'rgba(16, 24, 38, 0.82)',
  tabBarBorder: 'rgba(98, 201, 188, 0.14)',
  shadow: '#060A12',
  focusRing: 'rgba(98, 201, 188, 0.42)',
  ambientStart: 'rgba(98, 180, 200, 0.05)',
  ambientEnd: 'rgba(11, 15, 23, 0)',
  chartWell: '#121A28',
  chartGrid: 'rgba(130, 160, 190, 0.11)',
};

export function getColors(theme: ResolvedTheme): DSColors {
  return theme === 'dark' ? darkColors : lightColors;
}

/** 4px base grid */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 40,
  10: 48,
} as const;

/** @deprecated Use `space` */
export const spacing = {
  xs: space[1],
  sm: space[2],
  md: space[3],
  lg: space[4],
  xl: space[5],
  xxl: space[6],
  xxxl: space[8],
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const layout = {
  screenPaddingX: space[4],
  screenPaddingTop: space[2],
  sectionGap: space[5],
  blockGap: space[3],
  /** Tighter vertical rhythm for dense lists */
  blockGapCompact: space[2],
  stackGap: space[2],
  cardPadding: space[4],
  cardPaddingLg: space[5],
  /** Floating tab bar dock */
  tabBarFloatMarginH: space[4],
  tabBarFloatMarginB: space[3],
  tabBarRadius: 26,
  inputMinHeight: 40,
  buttonMinHeight: 44,
  buttonMinHeightLg: 48,
  buttonMinHeightSm: 36,
  /** Tab bar chrome above home indicator (safe-area added in AppScreen) */
  tabBarClearance: TAB_BAR_CLEARANCE,
  footerClearance: TAB_BAR_CLEARANCE,
  iconHitSlop: 10,
  emptyMinHeight: 112,
  listItemMinHeight: 48,
  heroHeight: 88,
  heroHeightCompact: 72,
} as const;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

export const motion = {
  pressScale: 0.98,
  pressOpacity: 0.92,
  disabledOpacity: 0.62,
  durationFast: 120,
  durationNormal: 220,
  durationSlow: 360,
  staggerStep: 42,
  staggerMax: 320,
  enterTranslateY: 4,
  sheetDismissDistance: 100,
} as const;

export type TypeVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'body'
  | 'bodyMedium'
  | 'caption'
  | 'label'
  | 'overline';

/** Compact elegance — confident titles, airy body */
export const typography: Record<TypeVariant, TextStyle> = {
  display: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  title1: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.35,
    lineHeight: 24,
  },
  title2: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  title3: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.08,
    lineHeight: 20,
  },
  body: {fontSize: 14, fontWeight: '400', lineHeight: 22},
  bodyMedium: {fontSize: 14, fontWeight: '500', lineHeight: 22},
  caption: {fontSize: 12, fontWeight: '500', lineHeight: 18},
  label: {fontSize: 11, fontWeight: '600', letterSpacing: 0.35, lineHeight: 14},
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
};

export const legacyTypography = {
  hero: typography.display,
  h1: typography.title1,
  h2: typography.title2,
  body: typography.body,
  caption: typography.caption,
  label: typography.label,
};

export const touch = {
  minHeight: layout.buttonMinHeight,
  minWidth: 48,
} as const;

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'md' | 'lg' | 'sm';
export type CardVariant = 'elevated' | 'muted' | 'outline' | 'ghost' | 'brand';
