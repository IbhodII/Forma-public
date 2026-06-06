import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppEmptyState, AppErrorState, AppLoadingState, AppText} from '../../../design-system';
import {MobileLineChart, type LinePoint} from '../../analytics/MobileLineChart';
import type {WorkoutSensors} from '../../../types/cardio';
import {useDesignSystem} from '../../../design-system/useDesignSystem';

type Props = {
  sensors: WorkoutSensors | undefined;
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
};

function toSeries(
  elapsed: number[],
  values: (number | null)[],
  key: string,
  color: string,
): {key: string; color: string; points: LinePoint[]} | null {
  const points: LinePoint[] = [];
  for (let i = 0; i < elapsed.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      continue;
    }
    points.push({date: String(elapsed[i]), value: v});
  }
  if (!points.length) {
    return null;
  }
  return {key, color, points};
}

export function CardioSensorsBlock({sensors, loading, error, onRetry}: Props) {
  const {colors} = useDesignSystem();
  const charts = useMemo(() => {
    if (!sensors) {
      return [];
    }
    const e = sensors.elapsed_sec;
    const out = [];
    const cadence = toSeries(e, sensors.cadence, 'cadence', colors.stateAnalytics);
    const speed = toSeries(e, sensors.speed_kmh, 'speed', colors.accentSecondary);
    const elev = toSeries(e, sensors.elevation_m, 'elev', colors.success);
    if (cadence) {
      out.push({title: 'Каденс', series: [cadence]});
    }
    if (speed) {
      out.push({title: 'Скорость', series: [speed]});
    }
    if (elev) {
      out.push({title: 'Высота', series: [elev]});
    }
    return out;
  }, [sensors, colors.stateAnalytics, colors.accentSecondary, colors.success]);

  if (loading) {
    return <AppLoadingState label="Загрузка датчиков…" compact />;
  }
  if (error) {
    return (
      <AppErrorState
        message="Датчики FIT недоступны — нет сети"
        onRetry={onRetry}
        compact
      />
    );
  }
  if (!charts.length) {
    return <AppEmptyState title="Датчики FIT недоступны" compact />;
  }

  return (
    <View style={styles.root}>
      <AppText variant="title3">Датчики</AppText>
      {charts.map(c => (
        <View key={c.title} style={styles.chart}>
          <AppText variant="caption" color="textSecondary">
            {c.title}
          </AppText>
          <MobileLineChart series={c.series} height={140} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 12},
  chart: {gap: 4},
});
