import React, {useMemo} from 'react';
import {Alert, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  deleteStrengthSession,
  fetchStrengthSessionDetail,
  fetchStrengthSessions,
} from '../api/workouts';
import {AppButton} from '../design-system/components/AppButton';
import {AppCard} from '../design-system/components/AppCard';
import {AppErrorState} from '../design-system/components/AppErrorState';
import {AppHeader} from '../design-system/components/AppHeader';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {AppText} from '../design-system/components/AppText';
import {useScreenInsets} from '../layout/useScreenInsets';
import {useDesignSystem} from '../design-system/useDesignSystem';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';
import {
  compareVolumeDelta,
  formatDateLong,
  formatVolume,
  groupExercises,
  sessionSetCount,
  sessionVolume,
} from '../utils/workoutStats';

type Nav = NativeStackNavigationProp<WorkoutsStackParamList, 'WorkoutSessionDetail'>;
type Route = RouteProp<WorkoutsStackParamList, 'WorkoutSessionDetail'>;

export default function WorkoutSessionDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {date, workoutTitle} = route.params;
  const insets = useSafeAreaInsets();
  const {bottom: scrollBottom} = useScreenInsets();
  const {colors, layout, space} = useDesignSystem();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['strength-session-detail', date, workoutTitle],
    queryFn: () => fetchStrengthSessionDetail(date, workoutTitle),
  });

  const prevQuery = useQuery({
    queryKey: ['strength-session-prev', workoutTitle, date],
    queryFn: async () => {
      const res = await fetchStrengthSessions({workout_title: workoutTitle, limit: 20});
      const sorted = (res.items ?? [])
        .filter(s => s.date < date)
        .sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0] ?? null;
    },
  });

  const detail = detailQuery.data;
  const volume = detail ? sessionVolume(detail) : 0;
  const sets = detail ? sessionSetCount(detail) : 0;
  const warmupSets = detail
    ? (detail.exercises ?? []).filter((s: {is_warmup?: boolean}) => s.is_warmup).length +
      (detail.ordered_sets ?? []).filter((s: {is_warmup?: boolean}) => s.is_warmup).length
    : 0;
  const workingSets = Math.max(0, sets - warmupSets);
  const groups = useMemo(() => (detail ? groupExercises(detail) : []), [detail]);
  const prevVol = prevQuery.data ? sessionVolume(prevQuery.data) : 0;
  const volDelta = compareVolumeDelta(volume, prevVol);

  const deleteMutation = useMutation({
    mutationFn: () => deleteStrengthSession(date, workoutTitle),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['strength-sessions']});
      await queryClient.invalidateQueries({queryKey: ['strength-sessions-all']});
      await queryClient.invalidateQueries({queryKey: ['strength-sessions-recent']});
      navigation.navigate('WorkoutHistory');
    },
  });

  const onEdit = () => {
    navigation.navigate('WorkoutRecord', {
      workoutTitle,
      edit: {date, workoutTitle},
    });
  };

  const onDelete = () => {
    Alert.alert('Удалить тренировку?', `${formatDateLong(date)} · ${workoutTitle}`, [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  return (
    <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
      <AppHeader
        title={workoutTitle}
        subtitle={formatDateLong(date)}
        onClose={() => navigation.goBack()}
        closeIcon="back"
        inset={false}
      />

      {detailQuery.isLoading ? <AppLoadingState label="Загрузка…" /> : null}
      {detailQuery.error ? (
        <AppErrorState message="Не удалось загрузить" onRetry={() => detailQuery.refetch()} />
      ) : null}

      {detail ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenPaddingX,
            paddingBottom: scrollBottom + space[6],
            gap: layout.blockGap,
          }}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            <StatBox label="Объём" value={formatVolume(volume)} accent />
            <StatBox label="Подходы" value={`${workingSets}${warmupSets ? `+${warmupSets}р` : ''}`} />
            <StatBox label="Упражн." value={String(groups.length)} />
          </View>

          {volDelta ? (
            <AppCard variant="muted" padding="md" noShadow animateEnter={false}>
              <AppText variant="caption" color="textMuted">
                Сравнение с прошлой ({prevQuery.data?.date})
              </AppText>
              <AppText variant="bodyMedium" color="text">
                {volDelta} · было {formatVolume(prevVol)}
              </AppText>
            </AppCard>
          ) : null}

          {groups.map((g, gi) => (
            <AppCard key={`${g.exercise}-${gi}`} animateEnter={false} enterIndex={gi}>
              <AppText variant="title3" color="text">
                {g.exercise}
              </AppText>
              {g.bestSet ? (
                <AppText variant="caption" color="accent" style={{marginTop: space[1]}}>
                  Лучший: {g.bestSet.weight} кг × {g.bestSet.reps}
                </AppText>
              ) : null}
              <AppText variant="caption" color="textMuted" style={{marginTop: 2}}>
                Объём: {formatVolume(g.volume)}
              </AppText>
              <View style={{marginTop: space[2], gap: space[1]}}>
                {g.sets.filter(s => s.is_warmup).length ? (
                  <AppText variant="caption" color="textMuted">
                    Разминка
                  </AppText>
                ) : null}
                {g.sets
                  .filter(s => s.is_warmup)
                  .map((s, si) => (
                    <View key={`w-${si}`} style={[styles.setRow, {borderTopColor: colors.border}]}>
                      <AppText variant="caption" color="textMuted" style={styles.setIdx}>
                        Р{si + 1}
                      </AppText>
                      <AppText variant="body" color="text">
                        {s.weight ?? 0} кг × {s.reps ?? s.reps_str ?? '—'}
                      </AppText>
                    </View>
                  ))}
                {g.sets.filter(s => !s.is_warmup).length ? (
                  <AppText variant="caption" color="textMuted" style={{marginTop: space[1]}}>
                    Рабочие
                  </AppText>
                ) : null}
                {g.sets
                  .filter(s => !s.is_warmup)
                  .map((s, si) => (
                    <View key={`s-${si}`} style={[styles.setRow, {borderTopColor: colors.border}]}>
                      <AppText variant="caption" color="textMuted" style={styles.setIdx}>
                        {si + 1}
                      </AppText>
                      <AppText variant="body" color="text">
                        {s.weight ?? 0} кг × {s.reps ?? s.reps_str ?? '—'}
                      </AppText>
                    </View>
                  ))}
              </View>
            </AppCard>
          ))}

          <View style={{gap: space[2]}}>
            <AppButton label="Редактировать" icon="create-outline" onPress={onEdit} fullWidth />
            <AppButton
              label="Удалить"
              variant="danger"
              onPress={onDelete}
              loading={deleteMutation.isPending}
              fullWidth
            />
          </View>
        </ScrollView>
      ) : null}

    </View>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const {colors, typography, radius, space} = useDesignSystem();
  return (
    <View
      style={[
        styles.stat,
        {
          backgroundColor: accent ? colors.accentMuted : colors.surfaceMuted,
          borderRadius: radius.md,
        },
      ]}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText
        variant="title2"
        style={{color: accent ? colors.accent : colors.text, marginTop: space[1]}}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  statsRow: {flexDirection: 'row', gap: 8},
  stat: {flex: 1, padding: 12, alignItems: 'center'},
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  setIdx: {width: 20, fontWeight: '700'},
});
