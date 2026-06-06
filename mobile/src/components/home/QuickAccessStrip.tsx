import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {haptics} from '../../haptics';
import {TAB} from '../../navigation/routes';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

const ITEMS = [
  {tab: TAB.Workouts, label: 'Тренировки', icon: 'barbell-outline'},
  {tab: TAB.Food, label: 'Питание', icon: 'nutrition-outline'},
  {tab: TAB.Analytics, label: 'Аналитика', icon: 'pulse-outline'},
  {tab: TAB.HealthConnect, label: 'HC', icon: 'heart-outline'},
  {tab: TAB.Settings, label: 'Ещё', icon: 'settings-outline'},
] as const;

type Props = {
  onOpen: (tab: string) => void;
};

export function QuickAccessStrip({onOpen}: Props) {
  const {colors, typography, radius, layout, iconSize, space} = useDesignSystem();

  return (
    <View style={{paddingHorizontal: layout.screenPaddingX, gap: space[2]}}>
      <Text style={[typography.overline, {color: colors.textMuted}]}>Быстрый доступ</Text>
      <View style={[styles.row, {gap: space[2]}]}>
        {ITEMS.map(item => (
          <PressableScale
            key={item.tab}
            onPress={() => {
              haptics.tab();
              onOpen(item.tab);
            }}
            haptic={false}
            scaleTo={0.96}
            style={[
              styles.item,
              {
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.md,
                borderColor: colors.border,
              },
            ]}>
            <Icon name={item.icon} size={iconSize.md} color={colors.accent} />
            <Text style={[typography.caption, {color: colors.text, marginTop: 4, fontWeight: '600'}]}>
              {item.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap'},
  item: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    minHeight: 64,
    justifyContent: 'center',
  },
});
