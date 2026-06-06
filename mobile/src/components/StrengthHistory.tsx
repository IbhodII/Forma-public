import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQuery} from '@tanstack/react-query';

import {fetchStrengthSessions, type StrengthSession} from '../api/workouts';
import {AppButton} from '../design-system/components/AppButton';
import {AppCard} from '../design-system/components/AppCard';
import {AppEmptyState} from '../design-system/components/AppEmptyState';
import {AppErrorState} from '../design-system/components/AppErrorState';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {AppSection} from '../design-system/components/AppSection';
import {useDesignSystem} from '../design-system/useDesignSystem';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';

type Nav = NativeStackNavigationProp<WorkoutsStackParamList>;

type Props = {
  workoutTitle: string;
  presetId?: number;
  hideHeader?: boolean;
  /** Открыть детали вместо сразу редактора */
  onOpenSession?: (date: string, workoutTitle: string) => void;
};

type GroupedSet = {
  exercise: string;
  sets: Array<{weight?: number | null; reps?: number | null; reps_str?: string | null}>;
};

function grouped(session: StrengthSession): GroupedSet[] {
  const source = session.exercises || [];
  const map = new Map<string, GroupedSet>();
  source.forEach(set => {
    const key = set.exercise || 'Упражнение';
    const curr = map.get(key) || {exercise: key, sets: []};
    curr.sets.push(set);
    map.set(key, curr);
  });
  return [...map.values()];
}

export function StrengthHistory({workoutTitle, presetId, hideHeader, onOpenSession}: Props) {
  const navigation = useNavigation<Nav>();
  const {colors, typography, layout, space} = useDesignSystem();

  const sessionsQuery = useQuery({
    queryKey: ['strength-sessions', workoutTitle, presetId],
    queryFn: () => fetchStrengthSessions({workout_title: workoutTitle, preset_id: presetId}),
  });

  const sortedItems = useMemo(
    () =>
      (sessionsQuery.data?.items || [])
        .slice()
        .sort((a: StrengthSession, b: StrengthSession) => b.date.localeCompare(a.date)),
    [sessionsQuery.data?.items],
  );

  const onAdd = () => {
    navigation.navigate('WorkoutRecord', {workoutTitle, presetId});
  };

  const onOpen = (item: StrengthSession) => {
    if (onOpenSession) {
      onOpenSession(item.date, item.workout_title);
      return;
    }
    navigation.navigate('WorkoutRecord', {
      workoutTitle: item.workout_title,
      edit: {date: item.date, workoutTitle: item.workout_title},
    });
  };

  return (
    <View style={styles.root}>
      {!hideHeader ? (
        <AppSection title="Журнал" subtitle={workoutTitle} first>
          <AppButton label="Добавить тренировку" icon="add" onPress={onAdd} fullWidth />
        </AppSection>
      ) : (
        <AppButton
          label="Запись в журнал"
          icon="add-circle-outline"
          variant="soft"
          onPress={onAdd}
          style={{marginBottom: space[2]}}
        />
      )}

      {sessionsQuery.isLoading ? (
        <AppLoadingState label="Загружаем историю…" compact />
      ) : null}

      {sessionsQuery.error ? (
        <AppErrorState
          message="Не удалось загрузить историю"
          onRetry={() => sessionsQuery.refetch()}
          compact
        />
      ) : null}

      {!sessionsQuery.isLoading && !sessionsQuery.error && sortedItems.length === 0 ? (
        <AppEmptyState
          icon="barbell-outline"
          title="Пока нет записей"
          message="Начните тренировку — она появится здесь"
          actionLabel="Добавить"
          onAction={onAdd}
          compact
        />
      ) : null}

      <View style={{gap: layout.stackGap}}>
        {sortedItems.map((item: StrengthSession, idx: number) => {
          const ordered = item.ordered_sets || [];
          const asOrdered = Boolean(item.is_circuit || ordered.length);
          const groupedSets = grouped(item);
          return (
            <AppCard
              key={`${item.date}-${item.workout_title}-${idx}`}
              onPress={() => onOpen(item)}
              enterIndex={idx}
              animateEnter={idx < 8}>
              <Text style={[typography.title3, {color: colors.accent}]}>{item.date}</Text>
              <Text style={[typography.title2, {color: colors.text, marginTop: space[1]}]}>
                {item.workout_title}
              </Text>
              {asOrdered
                ? ordered.map(
                    (
                      set: {
                        exercise?: string;
                        weight?: number | null;
                        reps?: number | null;
                        reps_str?: string | null;
                      },
                      i: number,
                    ) => (
                      <Text
                        key={`o-${i}`}
                        style={[typography.caption, {color: colors.textSecondary, marginTop: space[1]}]}>
                        {i + 1}. {set.exercise}: {set.weight ?? 0} × {set.reps ?? set.reps_str ?? 0}
                      </Text>
                    ),
                  )
                : groupedSets.map((g, gi) => (
                    <View key={`g-${gi}`} style={{marginTop: space[2]}}>
                      <Text style={[typography.bodyMedium, {color: colors.text}]}>{g.exercise}</Text>
                      {g.sets.map((set, si) => (
                        <Text
                          key={`s-${si}`}
                          style={[typography.caption, {color: colors.textMuted}]}>
                          {set.weight ?? 0} × {set.reps ?? set.reps_str ?? 0}
                        </Text>
                      ))}
                    </View>
                  ))}
            </AppCard>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, gap: 12},
});
