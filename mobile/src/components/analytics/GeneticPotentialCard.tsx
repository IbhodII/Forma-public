import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchGeneticLimit} from '../../api/body';
import {AppCard, AppLoadingState, AppText} from '../../design-system';
import {useDesignSystem} from '../../design-system/useDesignSystem';

export function GeneticPotentialCard() {
  const {colors} = useDesignSystem();
  const {data, isLoading, isError, error} = useQuery({
    queryKey: ['genetic-limit'],
    queryFn: fetchGeneticLimit,
  });

  if (isLoading) {
    return <AppLoadingState label="Генетический предел…" compact />;
  }

  if (isError) {
    return (
      <AppCard padding="md">
        <AppText variant="caption" color="danger">
          {error instanceof Error ? error.message : 'Ошибка загрузки'}
        </AppText>
      </AppCard>
    );
  }

  if (!data) {
    return null;
  }

  if (data.status === 'no_height' || data.status === 'no_body') {
    return (
      <AppCard padding="md">
        <AppText variant="overline" color="textSecondary">
          Генетический предел
        </AppText>
        <AppText variant="body" color="textSecondary">
          {data.message}
        </AppText>
      </AppCard>
    );
  }

  const percent = data.percent ?? 0;
  const barWidth = `${Math.min(percent, 100)}%` as const;

  return (
    <AppCard padding="md">
      <AppText variant="overline" color="textSecondary">
        Генетический предел
      </AppText>
      <AppText variant="display" style={{color: colors.accent}}>
        {percent}%
      </AppText>
      {data.interpretation ? (
        <AppText variant="caption" color="textSecondary">
          {data.interpretation}
        </AppText>
      ) : null}
      <View style={[styles.track, {backgroundColor: colors.surfaceMuted}]}>
        <View style={[styles.fill, {width: barWidth, backgroundColor: colors.accent}]} />
      </View>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            Сухая масса
          </AppText>
          <AppText variant="title3">{data.lean_mass ?? '—'} кг</AppText>
        </View>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            До предела
          </AppText>
          <AppText variant="title3">{data.remaining_kg ?? '—'} кг</AppText>
        </View>
        <View style={styles.cell}>
          <AppText variant="caption" color="textMuted">
            Макс.
          </AppText>
          <AppText variant="title3">{data.max_lean_mass ?? '—'} кг</AppText>
        </View>
      </View>
      <AppText variant="caption" color="textMuted">
        {data.disclaimer}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  track: {height: 8, borderRadius: 4, marginVertical: 10, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: 4},
  grid: {flexDirection: 'row', gap: 8},
  cell: {flex: 1, alignItems: 'center'},
});
