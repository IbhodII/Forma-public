import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText} from '../../../design-system';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import type {CardioWorkout} from '../../../types/cardio';
import {buildCardioMetrics} from '../../../utils/cardioFormat';

type Props = {workout: CardioWorkout};

export function CardioSummaryBlock({workout}: Props) {
  const {colors, layout, space, radius} = useDesignSystem();
  const metrics = useMemo(() => buildCardioMetrics(workout), [workout]);

  return (
    <View style={[styles.grid, {gap: space[2]}]}>
      {metrics.map((m: {label: string; value: string}) => (
        <View
          key={m.label}
          style={[
            styles.cell,
            {
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.md,
              padding: space[3],
            },
          ]}>
          <AppText variant="caption" color="textMuted">
            {m.label}
          </AppText>
          <AppText variant="body" numberOfLines={2}>
            {m.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
  },
});
