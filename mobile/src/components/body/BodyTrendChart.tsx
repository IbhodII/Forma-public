import React, {useMemo} from 'react';
import {View} from 'react-native';

import {AnalyticsEmptyState} from '../analytics/AnalyticsEmptyState';
import {ChartCard} from '../analytics/ChartCard';
import {MobileLineChart} from '../analytics/MobileLineChart';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {
  BODY_CHART_HEIGHT,
  BODY_CHART_HEIGHT_EXPANDED,
  type BodyChartPoint,
  weightTrendSummary,
} from './bodyChart';

type Props = {
  title: string;
  summary?: string;
  points: BodyChartPoint[];
  unit?: string;
  defaultExpanded?: boolean;
};

export function BodyTrendChart({title, summary, points, unit = 'кг', defaultExpanded}: Props) {
  const {colors} = useDesignSystem();

  const displaySummary = summary ?? weightTrendSummary(points);

  const series = useMemo(
    () => [
      {
        key: 'body',
        color: colors.accent,
        points: points.map(p => ({date: p.date, value: p.value})),
      },
    ],
    [colors.accent, points],
  );

  if (points.length < 2) {
    return <AnalyticsEmptyState kind="body_weight" compact />;
  }

  return (
    <ChartCard
      title={title}
      summary={displaySummary}
      defaultExpanded={defaultExpanded}
      chartHeights={{collapsed: BODY_CHART_HEIGHT, expanded: BODY_CHART_HEIGHT_EXPANDED}}
      minChartBoxHeight={BODY_CHART_HEIGHT}>
      {({chartHeight}) => (
        <View style={{width: '100%'}}>
          <MobileLineChart
            series={series}
            height={chartHeight}
            yFormatter={v => `${v.toFixed(1)}${unit ? ` ${unit}` : ''}`}
          />
        </View>
      )}
    </ChartCard>
  );
}
