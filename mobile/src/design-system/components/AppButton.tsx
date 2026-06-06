import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';
import {BrandGradient} from './BrandGradient';
import type {ButtonSize, ButtonVariant} from '../tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
}: Props) {
  const {colors, radius, layout, typography, motion, shadows, iconSize} = useDesignSystem();

  const palette = getVariantStyle(variant, colors, Boolean(disabled || loading));
  const minH =
    size === 'lg'
      ? layout.buttonMinHeightLg
      : size === 'sm'
        ? layout.buttonMinHeightSm
        : layout.buttonMinHeight;

  const isPrimary = variant === 'primary';

  const haptic =
    variant === 'primary'
      ? 'cta'
      : variant === 'danger'
        ? 'warning'
        : variant === 'secondary' || variant === 'soft'
          ? 'soft'
          : variant === 'ghost'
            ? 'selection'
            : 'light';

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic={disabled || loading ? false : haptic}
      scaleTo={0.97}
      opacityTo={disabled ? motion.disabledOpacity : motion.pressOpacity}
      spring="snappy"
      style={[
        styles.base,
        fullWidth && styles.full,
        {
          minHeight: minH,
          borderRadius: radius.md,
          borderColor: palette.border,
          borderWidth: palette.borderWidth,
          overflow: 'hidden',
        },
        isPrimary && !disabled && shadows.cta,
        disabled && {opacity: motion.disabledOpacity},
        style,
      ]}>
      {isPrimary && !disabled ? (
        <BrandGradient variant="primary" />
      ) : (
        <View style={[StyleSheet.absoluteFill, {backgroundColor: palette.bg}]} />
      )}
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={iconSize.md} color={palette.fg} /> : null}
          <Text style={[styles.label, typography.caption, {color: palette.fg, fontWeight: '700'}]}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={iconSize.md} color={palette.fg} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

function getVariantStyle(
  variant: ButtonVariant,
  colors: ReturnType<typeof useDesignSystem>['colors'],
  disabled: boolean,
) {
  if (disabled) {
    return {
      bg: colors.surfaceMuted,
      fg: colors.textMuted,
      border: colors.border,
      borderWidth: 1,
    };
  }
  switch (variant) {
    case 'primary':
      return {bg: colors.accent, fg: colors.accentText, border: 'transparent', borderWidth: 0};
    case 'secondary':
      return {bg: colors.surface, fg: colors.text, border: colors.border, borderWidth: 1};
    case 'soft':
      return {bg: colors.accentMuted, fg: colors.accent, border: 'transparent', borderWidth: 0};
    case 'danger':
      return {bg: colors.dangerMuted, fg: colors.danger, border: 'transparent', borderWidth: 0};
    case 'ghost':
    default:
      return {bg: 'transparent', fg: colors.text, border: 'transparent', borderWidth: 0};
  }
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {alignSelf: 'stretch'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 1},
  label: {fontSize: 14},
});
