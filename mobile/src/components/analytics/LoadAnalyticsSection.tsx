import React, {useMemo} from 'react';
import {Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {
  fetchCardioTrimp,
  fetchCtlAtlTsb,
  fetchZoneTime,
  type CtlAtlTsbPoint,
  type DailyTrimpPoint,
  type ZoneTimeItem,
} from '../../api/analytics';
import {queryKeys} from '../../hooks/queryKeys';
import {fetchSleepSummary} from '../../api/sleep';
import {AppText, CollapsibleSection} from '../../design-system';
import {DataStateShell} from '../DataStateShell';
import {AnalyticsEmptyState} from './AnalyticsEmptyState';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {buildRecoveryFactors} from '../../utils/recoveryAdvice';
import {ChartCard} from './ChartCard';
import {MetricCarousel, type MetricCard} from './MetricCarousel';
import {MobileBarChart} from './MobileBarChart';
import {MobileLineChart} from './MobileLineChart';
import {ZoneBreakdown} from './ZoneBreakdown';
import {InsightList} from '../insights/InsightList';
import {buildInsightContext} from '../../insights/buildContext';
import {generateInsights} from '../../insights/generate';
import {
  interpretWorkload,
  periodRange,
  sumField,
  trendDelta,
  type PeriodDays,
} from './utils';

type Props = {period: PeriodDays};

export function LoadAnalyticsSection({period}: Props) {
  const {colors, typography, layout, chart} = useDesignSystem();
  const {from, to} = useMemo(() => periodRange(period), [period]);

  const ctlQuery = useQuery({
    queryKey: queryKeys.analyticsCtl(period),
    queryFn: () => fetchCtlAtlTsb(period),
    staleTime: 5 * 60 * 1000,
  });
  const trimpQuery = useQuery({
    queryKey: queryKeys.analyticsTrimp(from, to),
    queryFn: () => fetchCardioTrimp(from, to),
    staleTime: 5 * 60 * 1000,
  });
  const zoneQuery = useQuery({
    queryKey: queryKeys.analyticsZoneTime(period),
    queryFn: () => fetchZoneTime(period),
    staleTime: 5 * 60 * 1000,
  });
  const sleepQuery = useQuery({
    queryKey: queryKeys.sleepSummary(7),
    queryFn: () => fetchSleepSummary(7),
    staleTime: 5 * 60 * 1000,
  });

  const recoveryAdvice = useMemo(
    () =>
      buildRecoveryFactors({
        ctlSeries: ctlQuery.data?.items ?? [],
        dailyTrimp: trimpQuery.data?.items ?? [],
        sleepSummary: sleepQuery.data?.has_data ? sleepQuery.data : null,
      }),
    [ctlQuery.data?.items, trimpQuery.data?.items, sleepQuery.data],
  );

  const loading = ctlQuery.isLoading || trimpQuery.isLoading || zoneQuery.isLoading;
  const isError = ctlQuery.isError || trimpQuery.isError || zoneQuery.isError;
  const loadError = ctlQuery.error ?? trimpQuery.error ?? zoneQuery.error;
  const refetchAll = () => {
    void ctlQuery.refetch();
    void trimpQuery.refetch();
    void zoneQuery.refetch();
  };
  const current = ctlQuery.data?.current;
  const ctlItems: CtlAtlTsbPoint[] = useMemo(
    () => ctlQuery.data?.items ?? [],
    [ctlQuery.data?.items],
  );
  const trimpItems: DailyTrimpPoint[] = useMemo(
    () => trimpQuery.data?.items ?? [],
    [trimpQuery.data?.items],
  );
  const zoneItems: ZoneTimeItem[] = useMemo(
    () => zoneQuery.data?.items ?? [],
    [zoneQuery.data?.items],
  );
  const noLoadData = ctlItems.length < 2 && trimpItems.length === 0 && zoneItems.length === 0;

  const insight = interpretWorkload(current?.tsb, current?.ctl, current?.atl);
  const trimpSum = sumField(trimpItems, x => x.trimp);
  const trimpTrend = trendDelta(trimpItems.map(x => x.trimp));

  const loadInsights = useMemo(() => {
    if (noLoadData) {
      return [];
    }
    const ctx = buildInsightContext({
      ctlPoints: ctlItems,
      current,
      activityDates: ctlItems.map(p => p.date),
      stretchRecent: false,
      streak: 0,
      kcalToday: 0,
      proteinToday: 0,
      isFemale: false,
      trimpValues: trimpItems.map(x => x.trimp),
    });
    return generateInsights(ctx, 'analytics', 3).filter(
      i => i.category === 'workload' || i.category === 'fatigue' || i.category === 'recovery',
    );
  }, [ctlItems, current, trimpItems, noLoadData]);

  const metrics: MetricCard[] = [
    {
      id: 'ctl',
      label: 'CTL',
      value: current?.ctl != null ? String(Math.round(current.ctl)) : '—',
      hint: 'Форма',
      accent: colors.stateTraining,
    },
    {
      id: 'atl',
      label: 'ATL',
      value: current?.atl != null ? String(Math.round(current.atl)) : '—',
      hint: 'Усталость',
      accent: colors.accentWarm,
    },
    {
      id: 'tsb',
      label: 'TSB',
      value: current?.tsb != null ? String(Math.round(current.tsb)) : '—',
      hint: 'Баланс',
      accent: colors.stateRecovery,
    },
    {
      id: 'trimp',
      label: 'TRIMP',
      value: String(Math.round(trimpSum)),
      delta:
        trimpTrend != null
          ? `${trimpTrend >= 0 ? '+' : ''}${Math.round(trimpTrend)} /день`
          : undefined,
      deltaUp: trimpTrend != null ? trimpTrend >= 0 : undefined,
      hint: `за ${period}д`,
    },
  ];

  let topZone: ZoneTimeItem | undefined;
  for (const z of zoneItems) {
    if (!topZone || z.percent > topZone.percent) {
      topZone = z;
    }
  }

  if (!loading && !isError && noLoadData) {
    return <AnalyticsEmptyState kind="load_ctl" compact />;
  }

  return (
    <DataStateShell
      isLoading={loading}
      isError={isError}
      error={loadError}
      onRetry={refetchAll}
      isEmpty={!loading && !isError && ctlItems.length < 2}
      emptyMessage="Данных по нагрузке пока нет">
    <View style={{gap: layout.blockGap}}>
      {loadInsights.length > 0 ? (
        <InsightList insights={loadInsights} title="Интерпретация нагрузки" compact />
      ) : null}
      <MetricCarousel items={metrics} />
      {topZone ? (
        <Text style={[typography.caption, {color: colors.textSecondary}]}>
          Больше всего времени в зоне «{topZone.name}» ({topZone.percent.toFixed(0)}%) —{' '}
          {topZone.percent > 35
            ? 'проверьте распределение интенсивности.'
            : 'распределение выглядит умеренным.'}
        </Text>
      ) : null}

      <ChartCard
        title="CTL и ATL"
        defaultExpanded
        summary={
          current?.ctl != null && current?.atl != null
            ? `CTL ${Math.round(current.ctl)} · ATL ${Math.round(current.atl)}`
            : 'Форма и недавняя усталость'
        }
        insight="CTL растёт при регулярной нагрузке, ATL отражает недавнюю усталость."
        legend={[
          {label: 'CTL', color: chart.primary},
          {label: 'ATL', color: chart.tertiary},
        ]}>
        {({chartHeight}) => (
          <MobileLineChart
            height={chartHeight}
            series={[
              {
                key: 'ctl',
                color: chart.primary,
                points: ctlItems.map(x => ({date: x.date, value: x.ctl})),
              },
              {
                key: 'atl',
                color: chart.tertiary,
                points: ctlItems.map(x => ({date: x.date, value: x.atl})),
              },
            ]}
          />
        )}
      </ChartCard>

      <ChartCard
        title="TSB — баланс формы"
        defaultExpanded={false}
        summary={
          current?.tsb != null
            ? `TSB ${Math.round(current.tsb)} — ${insight.title.toLowerCase()}`
            : 'Запас формы'
        }
        insight="Положительный TSB — больше запаса, отрицательный — накопленная усталость."
        legend={[{label: 'TSB', color: chart.secondary}]}>
        {({chartHeight}) => (
          <MobileLineChart
            height={chartHeight}
            series={[
              {
                key: 'tsb',
                color: chart.secondary,
                points: ctlItems.map(x => ({date: x.date, value: x.tsb})),
              },
            ]}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Дневной TRIMP"
        defaultExpanded={false}
        summary={`Сумма ${Math.round(trimpSum)} за период`}
        insight="Чем выше столбик, тем тяжелее кардио-день по модели нагрузки.">
        {({chartHeight}) => (
          <MobileBarChart
            height={chartHeight}
            color={colors.accent}
            points={trimpItems.map(x => ({date: x.date, value: x.trimp}))}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Зоны пульса"
        defaultExpanded={false}
        summary={
          zoneItems.length
            ? `${zoneQuery.data?.total_seconds ? Math.round((zoneQuery.data.total_seconds || 0) / 60) : 0} мин всего`
            : 'Нет записей'
        }
        insight="Горизонтальные полосы удобнее круговой диаграммы на телефоне — сразу видно долю каждой зоны.">
        {() =>
          zoneItems.length > 0 ? (
            <ZoneBreakdown zones={zoneItems} />
          ) : (
            <AnalyticsEmptyState kind="zone_hr" compact />
          )
        }
      </ChartCard>

      <CollapsibleSection
        title="Восстановление"
        subtitle={recoveryAdvice.title}
        defaultOpen={insight.status === 'fatigued' || insight.status === 'loaded'}>
        <AppText variant="body" color="textSecondary">
          {recoveryAdvice.message}
        </AppText>
        {recoveryAdvice.factors.slice(0, 3).map(f => (
          <AppText key={f} variant="caption" color="textMuted" style={{marginTop: 6}}>
            • {f}
          </AppText>
        ))}
      </CollapsibleSection>
    </View>
    </DataStateShell>
  );
}
