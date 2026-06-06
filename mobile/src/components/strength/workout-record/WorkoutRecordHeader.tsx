import React from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';

import {AppCard} from '../../../design-system/components/AppCard';
import {AppInput} from '../../../design-system/components/AppInput';
import {useDesignSystem} from '../../../design-system/useDesignSystem';

type Props = {
  date: string;
  onDateChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  avgHr: string;
  onAvgHrChange: (v: string) => void;
  kcalChest: string;
  onKcalChestChange: (v: string) => void;
  kcalWatch: string;
  onKcalWatchChange: (v: string) => void;
  circuitWorkout: boolean;
  onCircuitChange: (v: boolean) => void;
  elapsedLabel: string;
};

export function WorkoutRecordHeader({
  date,
  onDateChange,
  title,
  onTitleChange,
  avgHr,
  onAvgHrChange,
  kcalChest,
  onKcalChestChange,
  kcalWatch,
  onKcalWatchChange,
  circuitWorkout,
  onCircuitChange,
  elapsedLabel,
}: Props) {
  const {colors, typography, layout} = useDesignSystem();

  return (
    <AppCard variant="elevated" animateEnter={false} style={{gap: layout.stackGap}}>
      <View style={styles.timerRow}>
        <Text style={[typography.caption, {color: colors.textMuted}]}>Таймер сессии</Text>
        <Text style={[typography.title3, {color: colors.text}]}>{elapsedLabel}</Text>
      </View>
      <AppInput label="Дата (ГГГГ-ММ-ДД)" value={date} onChangeText={onDateChange} />
      <AppInput label="Тип тренировки" value={title} onChangeText={onTitleChange} />
      <View style={[styles.metrics, {gap: layout.stackGap}]}>
        <AppInput
          label="Ср. пульс"
          value={avgHr}
          onChangeText={onAvgHrChange}
          keyboardType="number-pad"
        />
        <AppInput
          label="Ккал (нагрудный)"
          value={kcalChest}
          onChangeText={onKcalChestChange}
          keyboardType="number-pad"
        />
        <AppInput
          label="Ккал (часы)"
          value={kcalWatch}
          onChangeText={onKcalWatchChange}
          keyboardType="number-pad"
        />
      </View>
      <View style={styles.circuitRow}>
        <Text style={[typography.body, {color: colors.text, flex: 1}]}>Круговая тренировка</Text>
        <Switch
          value={circuitWorkout}
          onValueChange={onCircuitChange}
          trackColor={{false: colors.border, true: colors.accent}}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  timerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  metrics: {},
  circuitRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
});
