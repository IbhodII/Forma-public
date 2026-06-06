import React from 'react';
import {StyleSheet, View} from 'react-native';

import type {BodyMetricRow} from '../../types/body';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {StatChip} from '../../ui/StatChip';

type Props = {
  latest: BodyMetricRow | null | undefined;
};

function fmt(value: number | null | undefined, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${value}${suffix}`;
}

export function BodyMetricsGrid({latest}: Props) {
  const {layout} = useDesignSystem();

  return (
    <View style={[styles.grid, {gap: layout.blockGapCompact}]}>
      <View style={[styles.row, {gap: layout.blockGapCompact}]}>
        <StatChip label="Вес" value={fmt(latest?.weight_kg, ' кг')} icon="scale-outline" accent />
        <StatChip
          label="% жира"
          value={fmt(latest?.body_fat_percent, '%')}
          icon="body-outline"
        />
      </View>
      <View style={[styles.row, {gap: layout.blockGapCompact}]}>
        <StatChip
          label="Мышцы"
          value={fmt(latest?.muscle_mass_kg, ' кг')}
          icon="fitness-outline"
        />
        <StatChip label="BMI" value={fmt(latest?.bmi)} icon="analytics-outline" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  row: {flexDirection: 'row'},
});
