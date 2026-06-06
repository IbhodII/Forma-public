import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchStretchingActivity} from '../api/stretching';
import {AppCard, AppEmptyState, AppLoadingState, AppText} from '../design-system';
import type {StretchingActivityDay} from '../types/stretching';

const today = () => new Date().toISOString().slice(0, 10);

export function StretchingJourneyTab() {
  const activityQuery = useQuery({
    queryKey: ['stretching-activity', 90],
    queryFn: () => fetchStretchingActivity(90),
  });

  const stats = useMemo(() => {
    const rows = activityQuery.data || [];
    const withMinutes = rows.filter((r: StretchingActivityDay) => (r.total_minutes ?? 0) > 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCut = weekAgo.toISOString().slice(0, 10);
    const weekMinutes = withMinutes
      .filter((r: StretchingActivityDay) => r.date >= weekCut)
      .reduce((s: number, r: StretchingActivityDay) => s + (r.total_minutes ?? 0), 0);

    let streak = 0;
    const sorted = [...withMinutes].sort((a, b) => b.date.localeCompare(a.date));
    let cursor = today();
    for (const row of sorted) {
      if (row.date === cursor && (row.total_minutes ?? 0) > 0) {
        streak += 1;
        const d = new Date(`${cursor}T12:00:00`);
        d.setDate(d.getDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      } else if (row.date < cursor) {
        break;
      }
    }

    const todayRow = rows.find((r: StretchingActivityDay) => r.date === today());
    return {
      streak,
      weekMinutes: Math.round(weekMinutes),
      todayMinutes: todayRow?.total_minutes ?? 0,
      sessions: withMinutes.length,
    };
  }, [activityQuery.data]);

  if (activityQuery.isLoading) {
    return <AppLoadingState label="Статистика…" compact />;
  }

  if (!activityQuery.data?.length) {
    return <AppEmptyState title="Пока нет сессий растяжки" compact />;
  }

  return (
    <View style={styles.root}>
      <AppCard padding="lg">
        <AppText variant="overline" color="textSecondary">
          Сегодня
        </AppText>
        <AppText variant="display">{stats.todayMinutes} мин</AppText>
      </AppCard>
      <View style={styles.row}>
        <AppCard padding="md" style={styles.stat}>
          <AppText variant="caption" color="textMuted">
            Серия дней
          </AppText>
          <AppText variant="title2">{stats.streak}</AppText>
        </AppCard>
        <AppCard padding="md" style={styles.stat}>
          <AppText variant="caption" color="textMuted">
            За 7 дней
          </AppText>
          <AppText variant="title2">{stats.weekMinutes} мин</AppText>
        </AppCard>
        <AppCard padding="md" style={styles.stat}>
          <AppText variant="caption" color="textMuted">
            Сессий (90д)
          </AppText>
          <AppText variant="title2">{stats.sessions}</AppText>
        </AppCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 12},
  row: {flexDirection: 'row', gap: 8},
  stat: {flex: 1},
});
