import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppEmptyState, AppErrorState, AppLoadingState, AppText} from '../../../design-system';
import {MobileLineChart, type LinePoint} from '../../analytics/MobileLineChart';
import type {CardioWorkout, WorkoutPowerResponse} from '../../../types/cardio';
import {useDesignSystem} from '../../../design-system/useDesignSystem';

type Props = {
  workout: CardioWorkout;
  power: WorkoutPowerResponse | undefined;
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
};

export function CardioPowerBlock({workout, power, loading, error, onRetry}: Props) {
  const {colors} = useDesignSystem();
  const isBike = workout.type === 'вело';
  const series = useMemo(() => {
    if (!power?.series?.length) {
      return [];
    }
    const points: LinePoint[] = power.series.map(p => ({
      date: String(p.elapsed_sec),
      value: p.power_watts,
    }));
    return [{key: 'power', color: colors.warning, points}];
  }, [power, colors.warning]);

  if (!isBike) {
    return null;
  }

  const avgLabel =
    power?.avg_power != null
      ? `${Math.round(power.avg_power)} Вт (${power.source === 'estimated' ? 'оценка' : 'датчик'})`
      : workout.avg_power_watts != null
        ? `${Math.round(workout.avg_power_watts)} Вт`
        : workout.estimated_avg_power_watts != null
          ? `${Math.round(workout.estimated_avg_power_watts)} Вт (оценка)`
          : null;

  if (loading) {
    return <AppLoadingState label="Загрузка мощности…" compact />;
  }
  if (error) {
    return <AppErrorState message="Мощность недоступна" onRetry={onRetry} compact />;
  }
  if (!series.length && !avgLabel) {
    return <AppEmptyState title="Данные мощности отсутствуют" compact />;
  }

  return (
    <View style={styles.root}>
      <AppText variant="title3">Мощность</AppText>
      {avgLabel ? (
        <AppText variant="body" color="textSecondary">
          Средняя: {avgLabel}
        </AppText>
      ) : null}
      {series.length ? (
        <MobileLineChart series={series} height={140} yFormatter={v => `${Math.round(v)}`} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 8},
});
