import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {haptics} from '../../haptics';
import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';

type Props = {
  label: string;
  value?: string;
  icon?: string;
  onPress?: () => void;
  active?: boolean;
  accent?: boolean;
  variant?: 'stat' | 'pill';
  enterIndex?: number;
};

export function AppChip({
  label,
  value,
  icon,
  onPress,
  active,
  accent,
  variant = value != null ? 'stat' : 'pill',
}: Props) {
  const {colors, radius, typography, iconSize, motion, shadows, isDark} = useDesignSystem();
  const isPill = variant === 'pill';
  const filled = active || accent;

  const content = (
    <View
      style={[
        isPill ? styles.pill : styles.chip,
        {
          backgroundColor: filled
            ? isPill && active
              ? colors.accent
              : colors.accentMuted
            : colors.surface,
          borderColor: active ? colors.accent : colors.border,
          borderRadius: isPill ? radius.pill : radius.md,
        },
        isPill && active && shadows.glow,
        !filled && !isDark && shadows.sm,
      ]}>
      {icon ? (
        <Icon
          name={icon}
          size={iconSize.sm}
          color={
            isPill && active
              ? colors.accentText
              : filled
                ? colors.accent
                : colors.textMuted
          }
        />
      ) : null}
      {isPill ? (
        <Text
          style={[
            typography.bodyMedium,
            {
              color: active ? colors.accentText : colors.text,
              fontWeight: active ? '700' : '600',
            },
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      ) : (
        <View>
          <Text style={[typography.label, {color: colors.textMuted}]}>{label}</Text>
          {value ? (
            <Text
              style={[
                typography.title3,
                {color: colors.text, marginTop: 2, fontWeight: '800'},
              ]}
              numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={() => {
          if (!active) {
            haptics.selection();
          }
          onPress?.();
        }}
        haptic={false}
        scaleTo={0.96}
        opacityTo={motion.pressOpacity}
        spring="snappy">
        {content}
      </PressableScale>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    minWidth: 88,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
});
