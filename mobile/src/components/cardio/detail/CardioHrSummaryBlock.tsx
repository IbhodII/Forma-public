import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {StatusBadge} from '../../../design-system';
import {AppText} from '../../../design-system/components/AppText';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import type {CardioWorkout} from '../../../types/cardio';

function sourceLabel(dataSource: string | null | undefined): string {
  const ds = (dataSource || '').toLowerCase();
  if (ds.includes('polar')) {
    return 'Polar';
  }
  if (ds.includes('health') || ds.includes('connect') || ds.includes('hc')) {
    return 'Health Connect';
  }
  if (ds.includes('import') || ds.includes('fit')) {
    return 'Импорт';
  }
  return 'Вручную';
}

type HrPoint = {heart_rate: number};

type Props = {
  workout: CardioWorkout;
  points: HrPoint[];
  hasHr: boolean;
};

export function CardioHrSummaryBlock({workout, points, hasHr}: Props) {
  const {layout} = useDesignSystem();

  const stats = useMemo(() => {
    if (!points.length) {
      return null;
    }
    const vals = points.map(p => p.heart_rate).filter(v => v > 0);
    if (!vals.length) {
      return null;
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / vals.length),
      max: Math.max(...vals),
    };
  }, [points]);

  const durationLabel = useMemo(() => {
    const sec = workout.duration_sec || 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [workout.duration_sec]);

  return (
    <View style={[styles.root, {gap: layout.stackGap}]}>
      <View style={styles.badges}>
        <StatusBadge label={sourceLabel(workout.data_source)} tone="neutral" />
        {hasHr && stats ? (
          <StatusBadge label="С пульсом" tone="accent" />
        ) : (
          <StatusBadge label="Без пульса" tone="warning" />
        )}
      </View>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            Длительность
          </AppText>
          <AppText variant="title3">{durationLabel}</AppText>
        </View>
        {stats ? (
          <>
            <View style={styles.cell}>
              <AppText variant="caption" color="textMuted">
                Ср. пульс
              </AppText>
              <AppText variant="title3">{stats.avg}</AppText>
            </View>
            <View style={styles.cell}>
              <AppText variant="caption" color="textMuted">
                Макс.
              </AppText>
              <AppText variant="title3">{stats.max}</AppText>
            </View>
          </>
        ) : workout.avg_hr != null ? (
          <View style={styles.cell}>
            <AppText variant="caption" color="textMuted">
              Ср. пульс
            </AppText>
            <AppText variant="title3">{workout.avg_hr}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {width: '100%'},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 16},
  cell: {minWidth: 72},
});
