import React, {useMemo, useState} from 'react';
import {FlatList, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQuery} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchAllStrengthSessions, type StrengthSession} from '../api/workouts';
import {useScreenInsets} from '../layout/useScreenInsets';
import {WorkoutHistoryCard} from '../components/workout/WorkoutHistoryCard';
import {AppChip} from '../design-system/components/AppChip';
import {AppEmptyState} from '../design-system/components/AppEmptyState';
import {AppErrorState} from '../design-system/components/AppErrorState';
import {AppHeader} from '../design-system/components/AppHeader';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {AppText} from '../design-system/components/AppText';
import {useDesignSystem} from '../design-system/useDesignSystem';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';
import {sessionVolume} from '../utils/workoutStats';

type Nav = NativeStackNavigationProp<WorkoutsStackParamList, 'WorkoutHistory'>;
type Route = RouteProp<WorkoutsStackParamList, 'WorkoutHistory'>;

const PERIOD_FILTERS = [
  {id: 'all', label: 'Все'},
  {id: '7', label: '7 дней'},
  {id: '30', label: '30 дней'},
  {id: '90', label: '90 дней'},
] as const;

type PeriodId = (typeof PERIOD_FILTERS)[number]['id'];
type SortId = 'date_desc' | 'volume_desc' | 'title';

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function WorkoutHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const {bottom: scrollBottom} = useScreenInsets();
  const {colors, layout, space} = useDesignSystem();

  const filterTitle = route.params?.workoutTitle ?? '';
  const [search, setSearch] = useState(filterTitle);
  const [period, setPeriod] = useState<PeriodId>('all');
  const [sort, setSort] = useState<SortId>('date_desc');

  const dateFrom =
    period === 'all' ? undefined : daysAgoIso(period === '7' ? 7 : period === '30' ? 30 : 90);

  const sessionsQuery = useQuery({
    queryKey: ['strength-sessions-all', dateFrom],
    queryFn: () => fetchAllStrengthSessions({limit: 300, date_from: dateFrom}),
  });

  const items = useMemo(() => {
    let list = [...(sessionsQuery.data?.items ?? [])];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s => s.workout_title.toLowerCase().includes(q));
    }
    if (filterTitle) {
      list = list.filter(s => s.workout_title === filterTitle);
    }
    if (sort === 'date_desc') {
      list.sort((a, b) => b.date.localeCompare(a.date));
    } else if (sort === 'volume_desc') {
      list.sort((a, b) => sessionVolume(b) - sessionVolume(a));
    } else {
      list.sort(
        (a, b) =>
          a.workout_title.localeCompare(b.workout_title, 'ru') || b.date.localeCompare(a.date),
      );
    }
    return list;
  }, [sessionsQuery.data?.items, search, filterTitle, sort]);

  return (
    <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
      <AppHeader
        title={filterTitle ? `Журнал · ${filterTitle}` : 'Журнал тренировок'}
        subtitle="Все силовые сессии"
        onClose={() => navigation.goBack()}
        closeIcon="back"
        inset={false}
      />

      <View style={{paddingHorizontal: layout.screenPaddingX, gap: space[3], flex: 1}}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по названию…"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.search,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surface,
            },
          ]}
        />

        <View style={styles.chips}>
          {PERIOD_FILTERS.map(f => (
            <AppChip
              key={f.id}
              label={f.label}
              variant="pill"
              active={period === f.id}
              onPress={() => setPeriod(f.id)}
            />
          ))}
        </View>

        <View style={styles.chips}>
          <AppChip
            label="По дате"
            variant="pill"
            active={sort === 'date_desc'}
            onPress={() => setSort('date_desc')}
          />
          <AppChip
            label="По объёму"
            variant="pill"
            active={sort === 'volume_desc'}
            onPress={() => setSort('volume_desc')}
          />
          <AppChip
            label="По типу"
            variant="pill"
            active={sort === 'title'}
            onPress={() => setSort('title')}
          />
        </View>

        {sessionsQuery.isLoading ? <AppLoadingState label="Загрузка журнала…" /> : null}
        {sessionsQuery.error ? (
          <AppErrorState message="Не удалось загрузить" onRetry={() => sessionsQuery.refetch()} />
        ) : null}

        {!sessionsQuery.isLoading && !sessionsQuery.error && items.length === 0 ? (
          <AppEmptyState
            icon="journal-outline"
            title="Нет тренировок"
            message="Запишите силовую — она появится в журнале"
            compact
          />
        ) : null}

        <FlatList
          data={items}
          keyExtractor={(item, i) => `${item.date}-${item.workout_title}-${i}`}
          renderItem={({item, index}) => (
            <WorkoutHistoryCard
              session={item}
              enterIndex={index}
              onPress={() =>
                navigation.navigate('WorkoutSessionDetail', {
                  date: item.date,
                  workoutTitle: item.workout_title,
                })
              }
            />
          )}
          contentContainerStyle={{
            gap: layout.stackGap,
            paddingBottom: scrollBottom + space[4],
          }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            items.length > 0 ? (
              <AppText variant="caption" color="textMuted">
                {items.length} {items.length === 1 ? 'тренировка' : 'тренировок'}
              </AppText>
            ) : null
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
