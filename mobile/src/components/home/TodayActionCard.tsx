import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {PrimaryCta} from '../../hooks/useHomeCompanion';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Props = {
  cta: PrimaryCta;
  intensityHint: string;
  onPress: () => void;
};

export function TodayActionCard({cta, intensityHint, onPress}: Props) {
  const {colors, typography, radius, iconSize, shadows, space} = useDesignSystem();

  return (
    <PressableScale onPress={onPress} haptic="cta" scaleTo={0.99} spring="soft">
      <View
        style={[
          styles.card,
          shadows.glow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderRadius: radius.lg,
            padding: space[3],
          },
        ]}>
        <View style={[styles.icon, {backgroundColor: colors.accentMuted}]}>
          <Icon name={cta.icon} size={iconSize.lg} color={colors.accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[typography.overline, {color: colors.textMuted}]}>Рекомендация дня</Text>
          <Text style={[typography.title2, {color: colors.text, marginTop: 2}]}>{cta.label}</Text>
          <Text style={[typography.caption, {color: colors.textSecondary, marginTop: 4}]}>
            {cta.subtitle}
          </Text>
          <Text style={[typography.caption, {color: colors.accent, marginTop: 6, fontWeight: '600'}]}>
            {intensityHint}
          </Text>
        </View>
        <Icon name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  copy: {flex: 1, minWidth: 0},
});
