import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {
  fetchExerciseProgress,
  fetchStrengthExercises,
  type ExerciseProgressPoint,
} from '../../api/strength';
import {AppChip} from '../../design-system/components/AppChip';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {AnalyticsEmptyState} from './AnalyticsEmptyState';
import {ChartCard} from './ChartCard';
import {MetricCarousel, type MetricCard} from './MetricCarousel';
import {MobileLineChart} from './MobileLineChart';
import {periodRange, type PeriodDays} from './utils';

type Props = {period: PeriodDays};

export function ProgressAnalyticsSection({period}: Props) {
  const {colors, typography, layout, space} = useDesignSystem();
  const {from, to} = useMemo(() => periodRange(period), [period]);
  const [exercise, setExercise] = useState('');

  const exQuery = useQuery({
    queryKey: ['strength-exercises-progress'],
    queryFn: fetchStrengthExercises,
    staleTime: 5 * 60 * 1000,
  });

  const exerciseName = useMemo(
    () => exercise || exQuery.data?.[0] || '',
    [exercise, exQuery.data],
  );

  const progressQuery = useQuery({
    queryKey: ['strength-progress', exerciseName, from, to],
    queryFn: () => fetchExerciseProgress(exerciseName, from, to),
    enabled: Boolean(exerciseName),
    staleTime: 5 * 60 * 1000,
  });

  const items: ExerciseProgressPoint[] = progressQuery.data ?? [];
  const latest = items.length ? items[items.length - 1] : null;
  const first = items.length ? items[0] : null;
  const weightDelta =
    latest && first ? latest.max_weight - first.max_weight : null;
  const rmDelta = latest && first ? latest.epley_1rm - first.epley_1rm : null;

  const metrics: MetricCard[] = [
    {
      id: 'weight',
      label: 'Макс. вес',
      value: latest ? `${latest.max_weight} кг` : '—',
      delta:
        weightDelta != null
          ? `${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(1)} кг`
          : undefined,
      deltaUp: weightDelta != null ? weightDelta >= 0 : undefined,
    },
    {
      id: 'rm',
      label: '1ПМ',
      value: latest ? `${Math.round(latest.epley_1rm)} кг` : '—',
      delta:
        rmDelta != null ? `${rmDelta >= 0 ? '+' : ''}${Math.round(rmDelta)} кг` : undefined,
      deltaUp: rmDelta != null ? rmDelta >= 0 : undefined,
    },
  ];

  return (
    <View style={{gap: layout.blockGap}}>
      <MetricCarousel items={metrics} />
      <Text style={[typography.caption, {color: colors.textSecondary}]}>
        {weightDelta != null && weightDelta > 0
          ? `Рабочий максимум по «${exerciseName}» вырос — продолжайте постепенную прогрессию.`
          : 'Выберите упражнение, чтобы отслеживать вес и расчётный 1ПМ.'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: space[2]}}>
        {(exQuery.data ?? []).map((name: string) => (
          <AppChip
            key={name}
            label={name}
            variant="pill"
            active={exerciseName === name}
            onPress={() => setExercise(name)}
          />
        ))}
      </ScrollView>

      {(exQuery.isLoading || progressQuery.isLoading) && (
        <ActivityIndicator color={colors.accent} />
      )}

      {!exQuery.isLoading &&
      !progressQuery.isLoading &&
      !progressQuery.isError &&
      items.length === 0 ? (
        <AnalyticsEmptyState message="Нет силовых сессий за период — запишите тренировку с весами." />
      ) : null}

      <ChartCard
        title={`Прогресс · ${exerciseName}`}
        defaultExpanded
        summary={latest ? `Пик ${latest.max_weight} кг` : 'Нет сессий'}
        insight="Две линии: фактический максимальный вес и оценка 1ПМ по формуле Epley.">
        {({chartHeight}) => (
          <MobileLineChart
            height={chartHeight}
            series={[
              {
                key: 'weight',
                color: colors.accent,
                points: items.map(x => ({date: x.date, value: x.max_weight})),
              },
              {
                key: '1rm',
                color: colors.stateAnalytics,
                points: items.map(x => ({date: x.date, value: x.epley_1rm})),
              },
            ]}
          />
        )}
      </ChartCard>
    </View>
  );
}
