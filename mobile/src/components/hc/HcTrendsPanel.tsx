import React, {useMemo} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {AnalyticsEmptyState} from '../analytics/AnalyticsEmptyState';
import {ChartCard} from '../analytics/ChartCard';
import {MobileBarChart} from '../analytics/MobileBarChart';
import {periodRange, type PeriodDays} from '../analytics/utils';
import {useOffline} from '../../context/OfflineContext';
import {listDayMetricsInRange} from '../../database/hcStore';
import {DataStateShell} from '../DataStateShell';
import {getHcLastLocalReadAt, isHealthConnectModuleEnabled} from '../../services/hcModuleSettings';
import {AppCard, AppText, SectionHeader, StatusBadge} from '../../design-system';
import {useDesignSystem} from '../../design-system/useDesignSystem';

const CHART_H = 140;

function formatAge(iso: string | null): string {
  if (!iso) {
    return 'нет данных';
  }
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) {
    return 'меньше часа назад';
  }
  if (h < 24) {
    return `${Math.round(h)} ч назад`;
  }
  return `${Math.round(h / 24)} дн назад`;
}

function sleepHours(payload: {sleep?: {duration_seconds?: number}}): number | null {
  const sec = payload.sleep?.duration_seconds;
  return sec != null && sec > 0 ? sec / 3600 : null;
}

function hrDailyStats(samples?: Array<{bpm: number}>): {min: number; max: number; avg: number} | null {
  if (!samples?.length) {
    return null;
  }
  const vals = samples.map(s => s.bpm).filter(v => v > 0);
  if (!vals.length) {
    return null;
  }
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  };
}

type Props = {
  periodDays?: PeriodDays;
  moduleEnabled: boolean;
};

export function HcTrendsPanel({periodDays = 7, moduleEnabled}: Props) {
  const {colors, space, layout} = useDesignSystem();
  const {dbReady} = useOffline();
  const {from, to} = periodRange(periodDays);

  const metricsQuery = useQuery({
    queryKey: ['hc-trends', from, to],
    queryFn: () => listDayMetricsInRange(from, to),
    enabled: moduleEnabled && dbReady,
    staleTime: 60_000,
  });

  const lastReadQuery = useQuery({
    queryKey: ['hc-last-read'],
    queryFn: getHcLastLocalReadAt,
    staleTime: 30_000,
  });

  const rows = metricsQuery.data ?? [];

  const stepPoints = useMemo(
    () =>
      rows
        .filter(r => (r.payload.steps ?? 0) > 0)
        .map(r => ({date: r.date, value: r.payload.steps ?? 0})),
    [rows],
  );

  const sleepPoints = useMemo(
    () =>
      rows
        .map(r => ({date: r.date, hours: sleepHours(r.payload)}))
        .filter((x): x is {date: string; hours: number} => x.hours != null)
        .map(x => ({date: x.date, value: Math.round(x.hours * 10) / 10})),
    [rows],
  );

  const lastNight = useMemo(() => {
    const today = to;
    const row = rows.find(r => r.date === today) ?? rows[rows.length - 1];
    if (!row) {
      return null;
    }
    const h = sleepHours(row.payload);
    return h != null ? `${h.toFixed(1)} ч` : null;
  }, [rows, to]);

  const hrToday = useMemo(() => {
    const row = rows.find(r => r.date === to);
    if (!row?.payload.heart_rate_samples?.length) {
      return null;
    }
    return hrDailyStats(row.payload.heart_rate_samples);
  }, [rows, to]);

  const lastRead = lastReadQuery.data ?? null;
  const stale = lastRead
    ? Date.now() - new Date(lastRead).getTime() > 24 * 3600000
    : true;

  if (!moduleEnabled) {
    return (
      <AppCard padding="lg" style={{gap: space[2]}}>
        <AnalyticsEmptyState kind="hc_trends" />
      </AppCard>
    );
  }

  if (metricsQuery.isLoading && !metricsQuery.isError) {
    return (
      <DataStateShell isLoading loadingLabel="Загрузка данных Health Connect…">
        {null}
      </DataStateShell>
    );
  }

  if (metricsQuery.isError) {
    return (
      <DataStateShell
        isError
        error={metricsQuery.error}
        onRetry={() => void metricsQuery.refetch()}
      />
    );
  }

  return (
    <View style={{gap: layout.blockGap}}>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        <StatusBadge label={`Чтение: ${formatAge(lastRead)}`} tone={stale ? 'warning' : 'accent'} />
        {stale ? <StatusBadge label="Данные устарели" tone="warning" /> : null}
      </View>

      {rows.length === 0 ? (
        <AnalyticsEmptyState kind="hc_trends" />
      ) : (
        <>
          {stepPoints.length >= 2 ? (
            <ChartCard title="Шаги" summary={`${periodDays} дней`} defaultExpanded={false}>
              {({chartHeight}) => (
                <MobileBarChart height={chartHeight || CHART_H} color={colors.stateWellness} points={stepPoints} />
              )}
            </ChartCard>
          ) : (
            <AppText variant="caption" color="textMuted">
              Шаги: мало точек за период
            </AppText>
          )}

          <AppCard padding="md" style={{gap: space[2]}}>
            <SectionHeader title="Сон" />
            <AppText variant="body">
              {lastNight ? `Последняя ночь: ${lastNight}` : 'Нет данных сна за период'}
            </AppText>
            {sleepPoints.length >= 2 ? (
              <ChartCard title="Сон, ч" defaultExpanded={false} chartHeights={{collapsed: CHART_H, expanded: CHART_H}}>
                {({chartHeight}) => (
                  <MobileBarChart height={chartHeight || CHART_H} color={colors.accent} points={sleepPoints} />
                )}
              </ChartCard>
            ) : null}
          </AppCard>

          <AppCard padding="md" style={{gap: space[2]}}>
            <SectionHeader title="Пульс (день)" />
            {hrToday ? (
              <AppText variant="body" color="textSecondary">
                Ср. {hrToday.avg} · мин {hrToday.min} · макс {hrToday.max}
              </AppText>
            ) : (
              <AppText variant="caption" color="textMuted">
                Нет сэмплов пульса за сегодня
              </AppText>
            )}
          </AppCard>
        </>
      )}
    </View>
  );
}
