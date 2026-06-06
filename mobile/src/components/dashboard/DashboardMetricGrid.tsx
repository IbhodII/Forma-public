import React, {memo} from 'react';
import {View} from 'react-native';

import {MetricGrid, MetricTile} from '../../design-system';
import {useDesignSystem} from '../../design-system/useDesignSystem';

export type DashboardMetrics = {
  calories: number | null;
  protein: number | null;
  steps: number | null;
  sleepHours: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
};

type Props = {
  metrics: DashboardMetrics;
  showLoad?: boolean;
};

function fmt(n: number | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) {
    return '—';
  }
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

export const DashboardMetricGrid = memo(function DashboardMetricGrid({
  metrics,
  showLoad = true,
}: Props) {
  const {space} = useDesignSystem();

  return (
    <View style={{marginBottom: space[3]}}>
      <MetricGrid>
        <MetricTile label="Калории" value={fmt(metrics.calories)} unit="ккал" />
        <MetricTile label="Белок" value={fmt(metrics.protein)} unit="г" />
        <MetricTile label="Шаги" value={fmt(metrics.steps)} hint="сегодня" />
        <MetricTile
          label="Сон"
          value={metrics.sleepHours != null ? fmt(metrics.sleepHours, 1) : '—'}
          unit="ч"
        />
        {showLoad ? (
          <>
            <MetricTile label="CTL" value={fmt(metrics.ctl, 1)} />
            <MetricTile label="TSB" value={fmt(metrics.tsb, 1)} hint={`ATL ${fmt(metrics.atl, 1)}`} />
          </>
        ) : null}
      </MetricGrid>
    </View>
  );
});
