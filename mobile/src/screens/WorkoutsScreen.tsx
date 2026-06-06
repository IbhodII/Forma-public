import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/Ionicons';

import {
  fetchPresets,
  fetchStrengthSessions,
  fetchWorkoutTypes,
  type PresetItem,
  type StrengthSession,
} from '../api/workouts';
import {fetchCtlAtlTsb} from '../api/analytics';
import {haptics} from '../haptics';
import {CardioTab} from '../components/CardioTab';
import {ExercisesTab} from '../components/ExercisesTab';
import {PresetsTab} from '../components/PresetsTab';
import {StretchingHubPanel} from '../components/stretching/StretchingHubPanel';
import {StrengthHistory} from '../components/StrengthHistory';
import {AppButton, AppCard, AppChip} from '../design-system';
import {AppHero} from '../design-system/components/AppHero';
import {AppEmptyState} from '../design-system/components/AppEmptyState';
import {AppErrorState} from '../design-system/components/AppErrorState';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {BottomSheet} from '../ui/BottomSheet';
import {AppScreen} from '../design-system/components/AppScreen';
import {SectionHeader} from '../ui/SectionHeader';
import {SegmentedPills} from '../ui/SegmentedPills';
import {StatChip} from '../ui/StatChip';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';
import {withTimeout} from '../utils/asyncTimeout';

const LAST_PRESET_KEY = 'workouts:lastPreset';
const LAST_WORKOUT_TITLE_KEY = 'workouts:lastWorkoutTitle';
type Nav = NativeStackNavigationProp<WorkoutsStackParamList, 'WorkoutsHome'>;
const MODE_TABS = ['Тренировка', 'Кардио', 'Мобильность', 'Библиотека'] as const;
const LIB_TABS = ['Пресеты', 'Упражнения'] as const;

function resolvePresetId(presets: PresetItem[], title: string) {
  return presets.find(p => p.name === title)?.id;
}

function formatDateShort(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}

export default function WorkoutsScreen() {
  const navigation = useNavigation<Nav>();
  const {colors, typography, heroText, layout} = useDesignSystem();
  const [activeMode, setActiveMode] = useState<(typeof MODE_TABS)[number]>('Тренировка');
  const [libTab, setLibTab] = useState<(typeof LIB_TABS)[number]>('Пресеты');
  const [activeWorkoutTitle, setActiveWorkoutTitle] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const typesQuery = useQuery({
    queryKey: ['strength-workout-types'],
    queryFn: fetchWorkoutTypes,
  });
  const presetsQuery = useQuery({
    queryKey: ['strength-presets'],
    queryFn: fetchPresets,
  });
  const ctlQuery = useQuery({
    queryKey: ['workouts-ctl-snippet'],
    queryFn: async () => {
      try {
        return await withTimeout(fetchCtlAtlTsb(14), 3000, 'workouts.ctlSnippet');
      } catch {
        return {items: [], current: {}} as Awaited<ReturnType<typeof fetchCtlAtlTsb>>;
      }
    },
  });

  const workoutTypes = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);
  const presets = useMemo(() => presetsQuery.data ?? [], [presetsQuery.data]);
  const baseLoading = typesQuery.isLoading || presetsQuery.isLoading;
  const baseError = typesQuery.error || presetsQuery.error;
  const noTrainingData = workoutTypes.length === 0 && presets.length === 0;

  const sessionsQuery = useQuery({
    queryKey: ['strength-sessions-recent', activeWorkoutTitle],
    queryFn: () =>
      fetchStrengthSessions({
        workout_title: activeWorkoutTitle,
        limit: 8,
      }),
    enabled: Boolean(activeWorkoutTitle),
  });

  const recentSessions = useMemo(
    () =>
      (sessionsQuery.data?.items || [])
        .slice()
        .sort((a: StrengthSession, b: StrengthSession) => b.date.localeCompare(a.date)),
    [sessionsQuery.data?.items],
  );

  useEffect(() => {
    if (!workoutTypes.length) return;
    const init = async () => {
      const saved = await AsyncStorage.getItem(LAST_PRESET_KEY);
      setActiveWorkoutTitle(
        saved && workoutTypes.includes(saved) ? saved : workoutTypes[0]!,
      );
    };
    void init();
  }, [workoutTypes]);

  useEffect(() => {
    if (!activeWorkoutTitle) return;
    void AsyncStorage.setItem(LAST_PRESET_KEY, activeWorkoutTitle);
  }, [activeWorkoutTitle]);

  const activePresetId = useMemo(
    () => resolvePresetId(presets, activeWorkoutTitle),
    [presets, activeWorkoutTitle],
  );

  const startWorkout = useCallback(
    (title: string) => {
      void AsyncStorage.setItem(LAST_WORKOUT_TITLE_KEY, title);
      setActiveWorkoutTitle(title);
      setActiveMode('Тренировка');
      setPickerOpen(false);
      navigation.navigate('WorkoutRecord', {
        workoutTitle: title,
        presetId: resolvePresetId(presets, title),
      });
    },
    [navigation, presets],
  );

  const startLastWorkout = useCallback(async () => {
    const saved =
      (await AsyncStorage.getItem(LAST_WORKOUT_TITLE_KEY)) ||
      activeWorkoutTitle ||
      workoutTypes[0];
    if (saved) {
      startWorkout(saved);
      return;
    }
    // Never no-op: open recorder with a fallback title.
    startWorkout('Первая тренировка');
  }, [activeWorkoutTitle, startWorkout, workoutTypes]);

  const lastDate = recentSessions[0]?.date;
  const ctl = ctlQuery.data?.current?.ctl;
  const tsb = ctlQuery.data?.current?.tsb;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }, []);

  return (
    <AppScreen scroll>
      <AppHero compact>
        <Text style={[typography.overline, heroText.overline]}>FORMA · тренировки</Text>
        <Text style={[typography.title1, heroText.title, styles.heroTitle]}>{greeting}</Text>
        <Text style={[typography.caption, heroText.subtitle, styles.heroSub]} numberOfLines={2}>
          {lastDate
            ? `Последняя: ${formatDateShort(lastDate)} · ${activeWorkoutTitle || '—'}`
            : 'Запишите первую тренировку сегодня'}
        </Text>
        <AppButton
          label={activeWorkoutTitle ? `Продолжить: ${activeWorkoutTitle}` : 'Начать тренировку'}
          icon="play"
          size="md"
          onPress={() => void startLastWorkout()}
          style={styles.cta}
        />
        {workoutTypes.length > 1 ? (
          <AppButton
            label="Другой тип"
            variant="ghost"
            size="sm"
            onPress={() => setPickerOpen(true)}
          />
        ) : null}
      </AppHero>

      <View style={styles.statsRow}>
        <StatChip
          label="CTL"
          value={ctl != null ? ctl.toFixed(0) : '—'}
          icon="trending-up"
          accent
        />
        <StatChip
          label="TSB"
          value={tsb != null ? tsb.toFixed(0) : '—'}
          icon="flash"
        />
        <StatChip
          label="За неделю"
          value={String(recentSessions.length)}
          icon="calendar"
        />
      </View>

      {baseLoading ? <AppLoadingState label="Загружаем тренировки…" compact /> : null}

      {!baseLoading && baseError ? (
        <AppErrorState
          message="Не удалось загрузить вкладку тренировок"
          onRetry={() => {
            void typesQuery.refetch();
            void presetsQuery.refetch();
          }}
          compact
        />
      ) : null}

      {!baseLoading && !baseError && noTrainingData ? (
        <AppEmptyState
          icon="barbell-outline"
          title="Пока нет тренировок"
          message="Добавьте первую запись — вкладка будет заполняться автоматически."
          actionLabel="Первая тренировка"
          onAction={() => startWorkout('Первая тренировка')}
          compact
        />
      ) : null}

      {recentSessions.length > 0 ? (
        <>
          <SectionHeader
            title="Недавняя активность"
            actionLabel="Журнал"
            onAction={() => navigation.navigate('WorkoutHistory', {workoutTitle: activeWorkoutTitle})}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: layout.blockGapCompact, paddingBottom: layout.blockGapCompact}}>
            {recentSessions.slice(0, 6).map((item: StrengthSession, idx: number) => (
              <AppCard
                key={`${item.date}-${idx}`}
                enterIndex={idx}
                padding="md"
                onPress={() =>
                  navigation.navigate('WorkoutSessionDetail', {
                    date: item.date,
                    workoutTitle: item.workout_title,
                  })
                }
                style={styles.recentCard}>
                <Text style={[styles.recentDate, {color: colors.accent}]}>
                  {formatDateShort(item.date)}
                </Text>
                <Text style={[typography.title2, {color: colors.text}]} numberOfLines={2}>
                  {item.workout_title}
                </Text>
                <Text style={[styles.recentMeta, {color: colors.textMuted}]}>
                  {item.sets_count} подходов
                  {item.is_circuit ? ' · круговая' : ''}
                </Text>
              </AppCard>
            ))}
          </ScrollView>
        </>
      ) : null}

      {presets.length > 0 ? (
        <>
          <SectionHeader title="Пресеты" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: layout.blockGapCompact}}>
            {presets.map((p: PresetItem) => (
              <AppChip
                key={p.id}
                label={p.name}
                icon="layers-outline"
                variant="pill"
                active={activeWorkoutTitle === p.name}
                onPress={() => startWorkout(p.name)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SegmentedPills options={MODE_TABS} value={activeMode} onChange={setActiveMode} />

      {activeMode === 'Тренировка' ? (
        <View style={{gap: layout.blockGap}}>
          <AppButton
            label="Весь журнал тренировок"
            icon="journal-outline"
            variant="secondary"
            size="md"
            onPress={() => navigation.navigate('WorkoutHistory', undefined)}
            fullWidth
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: layout.blockGapCompact}}>
            {workoutTypes.map((name: string) => (
              <AppChip
                key={name}
                label={name}
                variant="pill"
                active={activeWorkoutTitle === name}
                onPress={() => setActiveWorkoutTitle(name)}
              />
            ))}
          </ScrollView>
          {activeWorkoutTitle ? (
            <StrengthHistory
              workoutTitle={activeWorkoutTitle}
              presetId={activePresetId}
              hideHeader
              onOpenSession={(date, title) =>
                navigation.navigate('WorkoutSessionDetail', {date, workoutTitle: title})
              }
            />
          ) : (
            <AppCard variant="muted" padding="md">
              <Text style={{color: colors.textMuted, textAlign: 'center'}}>
                Выберите тип тренировки
              </Text>
            </AppCard>
          )}
        </View>
      ) : null}

      {activeMode === 'Кардио' ? <CardioTab /> : null}

      {activeMode === 'Мобильность' ? <StretchingHubPanel navigation={navigation} /> : null}

      {activeMode === 'Библиотека' ? (
        <View style={{gap: layout.blockGap}}>
          <SegmentedPills options={LIB_TABS} value={libTab} onChange={setLibTab} />
          {libTab === 'Пресеты' ? <PresetsTab /> : <ExercisesTab />}
        </View>
      ) : null}

      <BottomSheet visible={pickerOpen} title="Выберите тренировку" onClose={() => setPickerOpen(false)}>
        <FlatList
          data={workoutTypes}
          keyExtractor={item => item}
          ItemSeparatorComponent={() => (
            <View style={{height: 1, backgroundColor: colors.border}} />
          )}
          renderItem={({item}) => (
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                haptics.light();
                void startWorkout(item);
              }}>
              <Icon name="barbell-outline" size={22} color={colors.accent} />
              <Text style={[styles.sheetLabel, {color: colors.text}]}>{item}</Text>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              style={[styles.sheetRow, {marginTop: 8}]}
              onPress={() => {
                setPickerOpen(false);
                setActiveMode('Кардио');
              }}>
              <Icon name="bicycle-outline" size={22} color={colors.accent} />
              <Text style={[styles.sheetLabel, {color: colors.text}]}>Кардио-тренировка</Text>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          }
        />
      </BottomSheet>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroTitle: {marginTop: 2},
  heroSub: {marginBottom: 6, marginTop: 2},
  cta: {marginTop: 2},
  statsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  recentCard: {
    width: Math.round(Dimensions.get('window').width * 0.72),
    maxWidth: 280,
  },
  recentDate: {fontSize: 12, fontWeight: '700', marginBottom: 6},
  recentMeta: {fontSize: 12, marginTop: 4},
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    minHeight: 52,
  },
  sheetLabel: {flex: 1, fontSize: 16, fontWeight: '600'},
});
