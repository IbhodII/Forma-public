import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Props = {
  stepIndex: number;
  totalSteps: number;
  overline?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  secondaryAction?: {label: string; onPress: () => void};
};

export function OnboardingShell({
  stepIndex,
  totalSteps,
  overline,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = 'Продолжить',
  nextDisabled,
  showBack = true,
  secondaryAction,
}: Props) {
  const insets = useSafeAreaInsets();
  const {colors, typography, layout, space, radius} = useDesignSystem();
  const progress = totalSteps > 0 ? (stepIndex + 1) / totalSteps : 0;

  return (
    <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
      <View style={[styles.inner, {paddingHorizontal: layout.screenPaddingX}]}>
        <View style={styles.progressRow}>
          {showBack && stepIndex > 0 && onBack ? (
            <PressableScale onPress={onBack} hitSlop={12} scaleTo={0.92}>
              <Text style={[typography.bodyMedium, {color: colors.textSecondary}]}>Назад</Text>
            </PressableScale>
          ) : (
            <View style={{width: 48}} />
          )}
          <View style={[styles.track, {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill}]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: colors.accent,
                  borderRadius: radius.pill,
                },
              ]}
            />
          </View>
          <Text style={[typography.caption, {color: colors.textMuted, minWidth: 36, textAlign: 'right'}]}>
            {stepIndex + 1}/{totalSteps}
          </Text>
        </View>

        <Animated.View entering={FadeInDown.duration(320).delay(40)} style={styles.hero}>
          {overline ? (
            <Text style={[typography.overline, {color: colors.accent, marginBottom: space[2]}]}>
              {overline}
            </Text>
          ) : null}
          <Text style={[typography.display, {color: colors.text, lineHeight: 34}]}>{title}</Text>
          {subtitle ? (
            <Text
              style={[
                typography.body,
                {color: colors.textSecondary, marginTop: space[2], lineHeight: 22},
              ]}>
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeIn.duration(280).delay(80)} style={styles.body}>
          {children}
        </Animated.View>
      </View>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + space[3],
            paddingHorizontal: layout.screenPaddingX,
            gap: space[2],
          },
        ]}>
        {secondaryAction ? (
          <PressableScale onPress={secondaryAction.onPress} scaleTo={0.98}>
            <Text style={[typography.bodyMedium, {color: colors.textMuted, textAlign: 'center'}]}>
              {secondaryAction.label}
            </Text>
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={onNext}
          disabled={nextDisabled}
          haptic="cta"
          scaleTo={0.98}
          style={[
            styles.cta,
            {
              backgroundColor: nextDisabled ? colors.surfaceMuted : colors.accent,
              borderRadius: radius.lg,
            },
          ]}>
          <Text
            style={[
              typography.title3,
              {
                color: nextDisabled ? colors.textMuted : colors.textInverse,
                fontWeight: '700',
              },
            ]}>
            {nextLabel}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  inner: {flex: 1},
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 16,
  },
  track: {flex: 1, height: 4, overflow: 'hidden'},
  fill: {height: '100%'},
  hero: {marginBottom: 20},
  body: {flex: 1},
  footer: {paddingTop: 8},
  cta: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
