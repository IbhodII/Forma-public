import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {FadeInUp} from 'react-native-reanimated';

import {haptics} from '../../haptics';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Option<T extends string> = {
  id: T;
  title: string;
  subtitle?: string;
  icon?: string;
};

type Props<T extends string> = {
  options: Option<T>[];
  selected: T[];
  max?: number;
  onChange: (next: T[]) => void;
};

export function OnboardingMultiSelect<T extends string>({
  options,
  selected,
  max = 3,
  onChange,
}: Props<T>) {
  const {colors, typography, radius, iconSize, space} = useDesignSystem();

  const toggle = (id: T) => {
    haptics.selection();
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
      return;
    }
    if (selected.length >= max) {
      onChange([...selected.slice(1), id]);
      return;
    }
    onChange([...selected, id]);
  };

  return (
    <View style={{flex: 1}}>
      <Text style={[typography.caption, {color: colors.textMuted, marginBottom: space[2]}]}>
        Выберите до {max}
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 24}}>
        {options.map((opt, index) => {
          const on = selected.includes(opt.id);
          return (
            <Animated.View key={opt.id} entering={FadeInUp.duration(260).delay(50 + index * 35)}>
              <PressableScale
                onPress={() => toggle(opt.id)}
                haptic={false}
                scaleTo={0.985}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? colors.accentMuted : colors.surface,
                    borderColor: on ? colors.accent : colors.border,
                    borderRadius: radius.lg,
                  },
                ]}>
                {opt.icon ? (
                  <Icon name={opt.icon} size={iconSize.md} color={on ? colors.accent : colors.textMuted} />
                ) : null}
                <View style={styles.chipCopy}>
                  <Text style={[typography.bodyMedium, {color: colors.text, fontWeight: '600'}]}>
                    {opt.title}
                  </Text>
                  {opt.subtitle ? (
                    <Text style={[typography.caption, {color: colors.textSecondary, marginTop: 2}]}>
                      {opt.subtitle}
                    </Text>
                  ) : null}
                </View>
                {on ? <Icon name="checkmark" size={iconSize.sm} color={colors.accent} /> : null}
              </PressableScale>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  chipCopy: {flex: 1},
});
