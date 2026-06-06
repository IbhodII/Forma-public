import React, {useMemo} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';

import {AppCard, AppText} from '../../design-system';
import type {FoodPhase} from '../../types/food';

type DayRow = {
  date: string;
  daily_totals?: {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
  };
};

type Props = {
  days: DayRow[];
  phase: FoodPhase;
};

export function FoodWeekSummary({days}: Props) {
  const stats = useMemo(() => {
    const withData = days.filter(d => (d.daily_totals?.calories ?? 0) > 0);
    const totalKcal = withData.reduce((s, d) => s + (d.daily_totals?.calories ?? 0), 0);
    const avgKcal = withData.length ? Math.round(totalKcal / withData.length) : 0;
    const totalProtein = withData.reduce((s, d) => s + (d.daily_totals?.protein ?? 0), 0);
    const avgProtein = withData.length ? Math.round(totalProtein / withData.length) : 0;
    const best = [...withData].sort(
      (a, b) => (b.daily_totals?.protein ?? 0) - (a.daily_totals?.protein ?? 0),
    )[0];
    return {daysLogged: withData.length, avgKcal, avgProtein, bestDay: best?.date};
  }, [days]);

  if (!days.length) {
    return null;
  }

  const cards = [
    {label: 'Дней с записями', value: String(stats.daysLogged)},
    {label: 'Средние ккал', value: stats.avgKcal ? `${stats.avgKcal}` : '—'},
    {label: 'Средний белок', value: stats.avgProtein ? `${stats.avgProtein} г` : '—'},
    {
      label: 'Лучший день (белок)',
      value: stats.bestDay ? stats.bestDay.slice(5) : '—',
    },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      {cards.map(c => (
        <AppCard key={c.label} padding="md" style={styles.card}>
          <AppText variant="caption" color="textMuted">
            {c.label}
          </AppText>
          <AppText variant="title3">{c.value}</AppText>
        </AppCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {marginVertical: 4},
  card: {minWidth: 108, marginRight: 8},
});
