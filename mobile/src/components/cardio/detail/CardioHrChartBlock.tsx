import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppEmptyState, AppErrorState, AppLoadingState, AppText} from '../../../design-system';
import {MobileLineChart, type LinePoint} from '../../analytics/MobileLineChart';
import {sampleByIndex} from '../../analytics/utils';
import {useDesignSystem} from '../../../design-system/useDesignSystem';

type Props = {
  points: {elapsed_sec?: number; seconds?: number; heart_rate: number}[];
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
};

export function CardioHrChartBlock({points, loading, error, onRetry}: Props) {
  const {colors} = useDesignSystem();
  const series = useMemo(() => {
    const sampled = sampleByIndex(points, Math.min(120, points.length));
    const linePoints: LinePoint[] = sampled.map((p, i) => ({
      date: String(p.elapsed_sec ?? p.seconds ?? i),
      value: p.heart_rate,
    }));
    return [{key: 'hr', color: colors.danger, points: linePoints}];
  }, [points, colors.danger]);

  if (loading) {
    return <AppLoadingState label="Загрузка пульса…" compact />;
  }
  if (error) {
    return (
      <AppErrorState
        message="Нет сети — детали недоступны"
        onRetry={onRetry}
        compact
      />
    );
  }
  if (!points.length) {
    return <AppEmptyState title="Пульс не записан" compact />;
  }

  return (
    <View style={styles.root}>
      <AppText variant="title3">Пульс</AppText>
      <MobileLineChart
        series={series}
        height={180}
        maxPoints={120}
        yFormatter={v => `${Math.round(v)}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 8},
});
