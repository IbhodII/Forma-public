import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {FadeInUp} from 'react-native-reanimated';

import {haptics} from '../../haptics';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Props = {
  title: string;
  subtitle?: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  index?: number;
};

export function OnboardingOption({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  index = 0,
}: Props) {
  const {colors, typography, radius, iconSize, space} = useDesignSystem();

  return (
    <Animated.View entering={FadeInUp.duration(280).delay(60 + index * 40)}>
      <PressableScale
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        haptic={false}
        scaleTo={0.985}
        style={[
          styles.card,
          {
            backgroundColor: selected ? colors.accentMuted : colors.surface,
            borderColor: selected ? colors.accent : colors.border,
            borderRadius: radius.lg,
          },
        ]}>
        {icon ? (
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: selected ? colors.accent : colors.surfaceMuted,
                borderRadius: radius.md,
              },
            ]}>
            <Icon
              name={icon}
              size={iconSize.lg}
              color={selected ? colors.textInverse : colors.accent}
            />
          </View>
        ) : null}
        <View style={styles.copy}>
          <Text style={[typography.title3, {color: colors.text, fontWeight: '700'}]}>{title}</Text>
          {subtitle ? (
            <Text style={[typography.caption, {color: colors.textSecondary, marginTop: space[1]}]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <Icon name="checkmark-circle" size={iconSize.lg} color={colors.accent} />
        ) : (
          <View style={[styles.ring, {borderColor: colors.borderStrong}]} />
        )}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {flex: 1, minWidth: 0},
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
});
