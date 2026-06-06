import React, {useMemo} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchCaloriesAnalytics, type CaloriesAnalyticsPoint} from '../../api/analytics';
import {queryKeys} from '../../hooks/queryKeys';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {AnalyticsEmptyState} from './AnalyticsEmptyState';
import {ChartCard} from './ChartCard';
import {MetricCarousel, type MetricCard} from './MetricCarousel';
import {MobileLineChart} from './MobileLineChart';
import {periodRange, sumField, trendDelta, type PeriodDays} from './utils';

type Props = {period: PeriodDays};

export function EnergyAnalyticsSection({period}: Props) {
  const {colors, typography, layout, chart} = useDesignSystem();
  const {from, to} = useMemo(() => periodRange(period), [period]);

  const caloriesQuery = useQuery({
    queryKey: queryKeys.analyticsCalories(from, to),
    queryFn: () => fetchCaloriesAnalytics(from, to),
    staleTime: 5 * 60 * 1000,
  });

  const items: CaloriesAnalyticsPoint[] = caloriesQuery.data?.items ?? [];
  const sumStrength = sumField(items, x => x.strength_kcal);
  const sumCardio = sumField(items, x => x.cardio_kcal);
  const sumTotal = sumField(items, x => x.total_kcal);
  const totalTrend = trendDelta(items.map(x => x.total_kcal));
  const cardioShare = sumTotal > 0 ? Math.round((sumCardio / sumTotal) * 100) : 0;

  const metrics: MetricCard[] = [
    {
      id: 'total',
      label: 'Всего',
      value: `${Math.round(sumTotal)}`,
      hint: 'ккал',
      delta:
        totalTrend != null
          ? `${totalTrend >= 0 ? '+' : ''}${Math.round(totalTrend)} /день`
          : undefined,
    },
    {
      id: 'str',
      label: 'Силовые',
      value: `${Math.round(sumStrength)}`,
      hint: 'ккал',
    },
    {
      id: 'cardio',
      label: 'Кардио',
      value: `${Math.round(sumCardio)}`,
      hint: `${cardioShare}% доли`,
    },
  ];

  const avgPerDay = items.length ? Math.round(sumTotal / items.length) : 0;

  return (
    <View style={{gap: layout.blockGap}}>
      <MetricCarousel items={metrics} />
      <Text style={[typography.caption, {color: colors.textSecondary}]}>
        {sumTotal > 0
          ? `В среднем ~${avgPerDay} ккал/день от тренировок. Кардио даёт ${cardioShare}% расхода.`
          : 'Калории считаются по записанным силовым и кардио-сессиям.'}
      </Text>
      <Text style={[typography.caption, {color: colors.textMuted}]}>
        Питание и общий расход (intake/TDEE) подключим отдельно — здесь только тренировочный вклад.
      </Text>

      {caloriesQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}

      {!caloriesQuery.isLoading && sumTotal === 0 ? (
        <AnalyticsEmptyState kind="energy" compact />
      ) : null}

      {sumTotal > 0 ? (
        <ChartCard
          title="Расход по дням"
          defaultExpanded
          summary={`${Math.round(sumTotal)} ккал за ${period} дней`}
          insight="Силовые и кардио складываются в общий тренировочный расход."
          legend={[
            {label: 'Силовые', color: chart.primary},
            {label: 'Кардио', color: chart.tertiary},
            {label: 'Итого', color: chart.secondary},
          ]}>
          {({chartHeight}) => (
            <MobileLineChart
              height={chartHeight}
              series={[
                {
                  key: 'str',
                  color: chart.primary,
                  points: items.map(x => ({date: x.date, value: x.strength_kcal})),
                },
                {
                  key: 'cardio',
                  color: chart.tertiary,
                  points: items.map(x => ({date: x.date, value: x.cardio_kcal})),
                },
                {
                  key: 'total',
                  color: chart.secondary,
                  points: items.map(x => ({date: x.date, value: x.total_kcal})),
                },
              ]}
            />
          )}
        </ChartCard>
      ) : null}
    </View>
  );
}
