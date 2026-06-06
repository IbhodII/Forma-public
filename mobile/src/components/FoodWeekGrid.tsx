import React, {memo} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';

import {AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type FoodWeekGridDay = {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  calories_intake: number;
  calories_expenditure: number | null;
  balance: number | null;
  bracelet_calories: number | null;
};

type Props = {
  days: FoodWeekGridDay[];
  onPressDay: (date: string) => void;
};

const dayShort = (date: string) =>
  ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][new Date(`${date}T00:00:00`).getDay()];

const FoodWeekGridDayCell = memo(function FoodWeekGridDayCell({
  day,
  isToday,
  balanceColor,
  onPress,
}: {
  day: FoodWeekGridDay;
  isToday: boolean;
  balanceColor: string;
  onPress: () => void;
}) {
  const {colors, radius} = useDesignSystem();
  return (
    <Pressable
      style={[
        styles.cell,
        {
          borderColor: isToday ? colors.accent : colors.border,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
          borderWidth: isToday ? 1.5 : StyleSheet.hairlineWidth + 0.5,
        },
      ]}
      onPress={onPress}>
      <AppText variant="title3">
        {dayShort(day.date)} {day.date.slice(5)}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Б: {day.protein || '-'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Ж: {day.fat || '-'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        У: {day.carbs || '-'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Кл: {day.fiber || '-'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Ккал: {day.calories_intake || '-'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Расх: {day.calories_expenditure == null ? '-' : Math.round(day.calories_expenditure)}
      </AppText>
      <AppText variant="caption" style={{color: balanceColor}}>
        Баланс: {day.balance == null ? '-' : Math.round(day.balance)}
      </AppText>
    </Pressable>
  );
});

export function FoodWeekGrid({days, onPressDay}: Props) {
  const {colors, layout} = useDesignSystem();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.row, {gap: layout.blockGapCompact}]}>
        {days.map(day => {
          const isToday = day.date === today;
          const balanceColor =
            day.balance == null
              ? colors.textMuted
              : day.balance <= 0
                ? colors.success
                : colors.danger;
          return (
            <FoodWeekGridDayCell
              key={day.date}
              day={day}
              isToday={isToday}
              balanceColor={balanceColor}
              onPress={() => onPressDay(day.date)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', paddingVertical: 8},
  cell: {width: 150, padding: 10, gap: 4},
});
