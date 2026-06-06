import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';

import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';
import {enterFadeDown} from '../motion/entering';
import type {CardVariant} from '../tokens';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
  padding?: 'md' | 'lg' | 'none';
  noShadow?: boolean;
  enterIndex?: number;
  animateEnter?: boolean;
};

export function AppCard({
  children,
  onPress,
  style,
  variant = 'elevated',
  padding = 'md',
  noShadow,
  enterIndex = 0,
  animateEnter = true,
}: Props) {
  const {colors, radius, layout, shadows, motion} = useDesignSystem();

  const bg =
    variant === 'muted'
      ? colors.surfaceMuted
      : variant === 'ghost'
        ? 'transparent'
        : variant === 'brand'
          ? colors.surface
          : colors.surface;

  const pad =
    padding === 'none' ? 0 : padding === 'lg' ? layout.cardPaddingLg : layout.cardPadding;

  const showBrandRail = variant === 'brand';
  const showHighlight = variant === 'elevated' || variant === 'brand';
  const cardRadius = radius.md;

  const inner = (
    <View
      style={[
        styles.card,
        !noShadow && (variant === 'elevated' || variant === 'brand' || variant === 'muted') &&
          shadows.card,
        {
          backgroundColor: bg,
          borderRadius: cardRadius,
          borderColor:
            variant === 'outline' || variant === 'elevated' || variant === 'brand' || variant === 'muted'
              ? colors.border
              : 'transparent',
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth + 0.5,
          padding: pad,
        },
        style,
      ]}>
      {showHighlight ? (
        <View
          pointerEvents="none"
          style={[styles.topHighlight, {backgroundColor: colors.surfaceHighlight}]}
        />
      ) : null}
      {showBrandRail ? (
        <View
          pointerEvents="none"
          style={[styles.brandRail, {backgroundColor: colors.accent}]}
        />
      ) : null}
      {children}
    </View>
  );

  const wrapped = onPress ? (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      opacityTo={motion.pressOpacity}
      spring="soft"
      accessibilityRole="button">
      {inner}
    </PressableScale>
  ) : (
    inner
  );

  if (!animateEnter) {
    return wrapped;
  }

  return <Animated.View entering={enterFadeDown(enterIndex)}>{wrapped}</Animated.View>;
}

const styles = StyleSheet.create({
  card: {overflow: 'hidden', maxWidth: '100%'},
  topHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    opacity: 0.65,
  },
  brandRail: {
    position: 'absolute',
    left: 0,
    top: '22%',
    width: 3,
    height: '56%',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
});
