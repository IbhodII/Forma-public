import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchMicrosWeek} from '../api/food';
import type {FoodPhase} from '../types/food';
import {AppCard} from '../design-system/components/AppCard';
import {AppEmptyState} from '../design-system/components/AppEmptyState';
import {AppErrorState} from '../design-system/components/AppErrorState';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  anchorDate: string;
  phase: FoodPhase;
};

export function FoodMicrosTab({anchorDate, phase}: Props) {
  const {colors, typography, layout, space} = useDesignSystem();
  const query = useQuery({
    queryKey: ['food-micros-week', anchorDate, phase],
    queryFn: () => fetchMicrosWeek(anchorDate, phase),
  });

  if (query.isLoading) {
    return <AppLoadingState label="Микронутриенты…" compact />;
  }

  if (query.error) {
    return (
      <AppErrorState message="Не удалось загрузить микронутриенты" onRetry={() => query.refetch()} compact />
    );
  }

  const days = query.data?.days || [];
  if (!days.length) {
    return (
      <AppEmptyState
        icon="nutrition-outline"
        title="Нет данных"
        message="Добавьте приёмы пищи в дневнике — микронутриенты появятся здесь"
        compact
      />
    );
  }

  return (
    <View style={{gap: layout.stackGap}}>
      {days.map((day: {date: string; nutrients: import('../api/food').MicroNutrientRow[]}) => (
        <AppCard key={day.date} animateEnter={false}>
          <Text style={[typography.title3, {color: colors.text, marginBottom: space[2]}]}>
            {day.date}
          </Text>
          {(day.nutrients || []).slice(0, 8).map((n: import('../api/food').MicroNutrientRow) => (
            <View key={`${day.date}-${n.key}`} style={styles.row}>
              <Text style={[typography.caption, {color: colors.textSecondary, flex: 1}]}>
                {n.label}
              </Text>
              <Text style={[typography.caption, {color: colors.text}]}>
                {n.has_data ? `${n.consumed ?? 0} / ${n.goal} ${n.unit}` : '—'}
                {n.percent != null ? ` (${n.percent}%)` : ''}
              </Text>
            </View>
          ))}
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6},
});
