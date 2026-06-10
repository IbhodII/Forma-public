import React from 'react';
import {StyleSheet, View} from 'react-native';

import type {BodyMetricRow} from '../../types/body';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {formatBodyMetricValue} from '../../utils/bodyMetrics';
import {StatChip} from '../../ui/StatChip';

type Props = {
  latest: BodyMetricRow | null | undefined;
};

export function BodyMetricsGrid({latest}: Props) {
  const {layout} = useDesignSystem();

  return (
    <View style={[styles.grid, {gap: layout.blockGapCompact}]}>
      <View style={[styles.row, {gap: layout.blockGapCompact}]}>
        <StatChip
          label="Вес"
          value={formatBodyMetricValue(latest?.weight_kg, ' кг')}
          icon="scale-outline"
          accent
        />
        <StatChip
          label="% жира"
          value={formatBodyMetricValue(latest?.body_fat_percent, '%')}
          icon="body-outline"
        />
      </View>
      <View style={[styles.row, {gap: layout.blockGapCompact}]}>
        <StatChip
          label="Мышцы"
          value={formatBodyMetricValue(latest?.muscle_mass_kg, ' кг')}
          icon="fitness-outline"
        />
        <StatChip
          label="BMI"
          value={formatBodyMetricValue(latest?.bmi)}
          icon="analytics-outline"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  row: {flexDirection: 'row'},
});
