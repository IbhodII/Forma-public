import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {
  fetchStrength1RmChart,
  fetchStrengthExercises,
  fetchStrengthVolume,
  fetchTopExercisesProgress,
  type StrengthOneRmPoint,
  type StrengthVolumePoint,
  type TopExerciseProgressItem,
} from '../../api/strength';
import {AppChip, CollapsibleSection} from '../../design-system';
import {AnalyticsEmptyState} from './AnalyticsEmptyState';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {CycleImpactCard} from './CycleImpactCard';
import {GeneticPotentialCard} from './GeneticPotentialCard';
import {ChartCard} from './ChartCard';
import {MetricCarousel, type MetricCard} from './MetricCarousel';
import {MobileBarChart} from './MobileBarChart';
import {MobileLineChart} from './MobileLineChart';
import {periodRange, sumField, trendDelta, type PeriodDays} from './utils';

type Props = {period: PeriodDays};

export function StrengthAnalyticsSection({period}: Props) {
  const {colors, typography, layout, space} = useDesignSystem();
  const {from, to} = useMemo(() => periodRange(period), [period]);
  const [exercise, setExercise] = useState('');

  const exerciseQuery = useQuery({
    queryKey: ['strength-exercises'],
    queryFn: fetchStrengthExercises,
    staleTime: 5 * 60 * 1000,
  });

  const exerciseName = useMemo(
    () => exercise || exerciseQuery.data?.[0] || '',
    [exercise, exerciseQuery.data],
  );

  const oneRmQuery = useQuery({
    queryKey: ['strength-1rm', exerciseName, from, to],
    queryFn: () => fetchStrength1RmChart(exerciseName, from, to),
    enabled: Boolean(exerciseName),
    staleTime: 5 * 60 * 1000,
  });
  const volumeQuery = useQuery({
    queryKey: ['strength-volume', from, to],
    queryFn: () => fetchStrengthVolume(from, to),
    staleTime: 5 * 60 * 1000,
  });
  const topQuery = useQuery({
    queryKey: ['strength-top-progress'],
    queryFn: fetchTopExercisesProgress,
    staleTime: 5 * 60 * 1000,
  });

  const oneRmData: StrengthOneRmPoint[] = oneRmQuery.data ?? [];
  const volumeData: StrengthVolumePoint[] = volumeQuery.data ?? [];
  const topItems: TopExerciseProgressItem[] = topQuery.data?.items ?? [];

  const volumeSum = sumField(volumeData, x => x.volume_kg);
  const volTrend = trendDelta(volumeData.map(x => x.volume_kg));
  const latest1Rm = oneRmData.length ? oneRmData[oneRmData.length - 1]!.epley_1rm : null;
  const first1Rm = oneRmData.length ? oneRmData[0]!.epley_1rm : null;
  const rmDelta =
    latest1Rm != null && first1Rm != null && first1Rm > 0
      ? latest1Rm - first1Rm
      : null;

  const metrics: MetricCard[] = [
    {
      id: 'vol',
      label: 'Объём',
      value: volumeSum >= 1000 ? `${(volumeSum / 1000).toFixed(1)}т` : `${Math.round(volumeSum)} кг`,
      delta:
        volTrend != null
          ? `${volTrend >= 0 ? '+' : ''}${Math.round(volTrend)} кг/трен`
          : undefined,
      hint: `за ${period}д`,
    },
    {
      id: '1rm',
      label: '1ПМ',
      value: latest1Rm != null ? `${Math.round(latest1Rm)} кг` : '—',
      delta: rmDelta != null ? `${rmDelta >= 0 ? '+' : ''}${Math.round(rmDelta)} кг` : undefined,
      deltaUp: rmDelta != null ? rmDelta >= 0 : undefined,
      hint: exerciseName || 'упражнение',
    },
    {
      id: 'top',
      label: 'Лидер роста',
      value: topItems[0]?.exercise?.slice(0, 12) ?? '—',
      hint:
        topItems[0]?.change_percent != null
          ? `+${topItems[0].change_percent.toFixed(0)}%`
          : 'топ упражнений',
    },
  ];

  const loading =
    exerciseQuery.isLoading || oneRmQuery.isLoading || volumeQuery.isLoading || topQuery.isLoading;

  return (
    <View style={{gap: layout.blockGap}}>
      <View style={{gap: layout.stackGap}}>
        <GeneticPotentialCard />
        <CycleImpactCard />
      </View>
      <MetricCarousel items={metrics} />
      <Text style={[typography.caption, {color: colors.textSecondary}]}>
        {rmDelta != null && rmDelta > 0
          ? `Оценочный 1ПМ по «${exerciseName}» растёт — хороший знак силовой прогрессии.`
          : volumeSum > 0
            ? 'Следите за объёмом и восстановлением между тяжёлыми сессиями.'
            : 'Добавьте силовые тренировки, чтобы увидеть объём и 1ПМ.'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: space[2]}}>
        {(exerciseQuery.data ?? []).map((name: string) => (
          <AppChip
            key={name}
            label={name}
            variant="pill"
            active={exerciseName === name}
            onPress={() => setExercise(name)}
          />
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}

      {topItems.length > 0 ? (
        <CollapsibleSection title="Топ прогресса" subtitle={`${topItems.length} упражнений`} defaultOpen={false}>
          {topItems.slice(0, 4).map(item => (
            <View
              key={item.exercise}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}>
              <Text style={[typography.caption, {color: colors.text, flex: 1}]} numberOfLines={1}>
                {item.exercise}
              </Text>
              <Text style={[typography.caption, {color: colors.success, fontWeight: '600'}]}>
                {item.change_percent != null ? `+${item.change_percent.toFixed(0)}%` : '—'}
              </Text>
            </View>
          ))}
        </CollapsibleSection>
      ) : null}

      {!loading && volumeSum === 0 && oneRmData.length < 2 ? (
        <AnalyticsEmptyState kind="strength" compact />
      ) : null}

      <ChartCard
        title={`1ПМ · ${exerciseName || 'упражнение'}`}
        defaultExpanded
        summary={
          latest1Rm != null ? `Сейчас ~${Math.round(latest1Rm)} кг (Epley)` : 'Выберите упражнение'
        }
        insight="Сглаженная кривая 1ПМ помогает видеть тренд без шума отдельных подходов.">
        {({chartHeight}) => (
          <MobileLineChart
            height={chartHeight}
            series={[
              {
                key: '1rm',
                color: colors.accent,
                points: oneRmData.map(x => ({date: x.date, value: x.epley_1rm})),
              },
            ]}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Тоннаж по дням"
        defaultExpanded={false}
        summary={`${volumeSum >= 1000 ? `${(volumeSum / 1000).toFixed(1)} т` : `${Math.round(volumeSum)} кг`} за период`}
        insight="Объём — вес × повторения. Рост объёма без прогресса в 1ПМ может сигнализировать о усталости.">
        {({chartHeight}) => (
          <MobileBarChart
            height={chartHeight}
            color={colors.stateAnalytics}
            points={volumeData.map(x => ({date: x.date, value: x.volume_kg}))}
            maxTicks={4}
          />
        )}
      </ChartCard>
    </View>
  );
}
