import React, {useCallback, useMemo, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {fetchCtlAtlTsb} from '../api/analytics';
import {
  createCardioWorkout,
  deleteCardioWorkout,
  fetchCardioTabSettings,
  fetchCardioWorkouts,
  updateCardioWorkout,
} from '../api/cardio';
import {
  AppButton,
  AppCard,
  AppChip,
  AppEmptyState,
  AppErrorState,
  AppInput,
  AppLoadingState,
  AppSheet,
  AppText,
} from '../design-system';
import {notifySave} from '../haptics';
import {buildInsightContext} from '../insights/buildContext';
import {generatePostWorkoutInsights} from '../insights/generate';
import type {CardioTypeSetting, CardioWorkout} from '../types/cardio';
import {WorkoutPeriodFilter} from './workout/WorkoutPeriodFilter';
import type {WorkoutPeriodDays} from '../utils/workoutPeriod';
import {periodDateFrom} from '../utils/workoutPeriod';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';

const CARDIO_TYPES = [
  {id: 'бег', label: 'Бег'},
  {id: 'вело', label: 'Велосипед'},
  {id: 'бассейн', label: 'Бассейн'},
] as const;
type CardioTypeId = (typeof CARDIO_TYPES)[number]['id'];

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPacePreview(distanceKm: number, durationMin: number): string {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin) || distanceKm <= 0 || durationMin <= 0) {
    return '—';
  }
  const pace = durationMin / distanceKm;
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')} /км`;
}

function formatSpeedPreview(distanceKm: number, durationMin: number): string {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin) || distanceKm <= 0 || durationMin <= 0) {
    return '—';
  }
  const speed = distanceKm / (durationMin / 60);
  return `${speed.toFixed(1)} км/ч`;
}

type FormState = {
  date: string;
  type: CardioTypeId;
  distance: string;
  durationMin: string;
  avgHr: string;
  maxHr: string;
  caloriesWatch: string;
  swolf: string;
};

const emptyForm = (): FormState => ({
  date: new Date().toISOString().slice(0, 10),
  type: 'бег',
  distance: '5',
  durationMin: '30',
  avgHr: '',
  maxHr: '',
  caloriesWatch: '',
  swolf: '',
});

export function CardioTab() {
  const qc = useQueryClient();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutsStackParamList, 'WorkoutsHome'>>();
  const [period, setPeriod] = useState<WorkoutPeriodDays>(30);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CardioWorkout | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [listLimit, setListLimit] = useState(50);

  const dateFrom = periodDateFrom(period);

  const workoutsQuery = useQuery({
    queryKey: ['cardio-workouts', period, typeFilter],
    queryFn: () =>
      fetchCardioWorkouts({
        limit: 100,
        date_from: dateFrom,
        type: typeFilter || undefined,
      }),
  });

  const tabSettingsQuery = useQuery({
    queryKey: ['cardio-tab-settings'],
    queryFn: () => fetchCardioTabSettings(true),
  });

  const typeOptions = useMemo(() => {
    const fromSettings = (tabSettingsQuery.data || [])
      .filter((t: CardioTypeSetting) => t.is_active !== 0)
      .map((t: CardioTypeSetting) => t.type);
    const fromWorkouts = (workoutsQuery.data?.items || []).map((w: CardioWorkout) => w.type);
    const all = new Set([...fromSettings, ...fromWorkouts]);
    return CARDIO_TYPES.filter(opt => all.has(opt.id));
  }, [tabSettingsQuery.data, workoutsQuery.data?.items]);

  const openCreate = () => {
    setEditing(null);
    const defaultType = (typeOptions[0]?.id || 'бег') as CardioTypeId;
    setForm({...emptyForm(), type: defaultType});
    setSheetOpen(true);
  };

  const openEdit = (item: CardioWorkout) => {
    setEditing(item);
    setForm({
      date: item.date,
      type: (CARDIO_TYPES.some(t => t.id === item.type) ? item.type : 'бег') as CardioTypeId,
      distance: String(item.distance_km ?? ''),
      durationMin: String(Math.round((item.duration_sec || 0) / 60)),
      avgHr: item.avg_hr != null ? String(item.avg_hr) : '',
      maxHr: item.max_hr != null ? String(item.max_hr) : '',
      caloriesWatch: item.calories_watch != null ? String(item.calories_watch) : '',
      swolf: item.swolf != null ? String(item.swolf) : '',
    });
    setSheetOpen(true);
  };

  const invalidate = async () => {
    await qc.invalidateQueries({queryKey: ['cardio-workouts']});
    await qc.invalidateQueries({queryKey: ['cardio-tab-settings']});
  };

  const createMutation = useMutation({
    mutationFn: createCardioWorkout,
    onSuccess: async () => {
      notifySave();
      await invalidate();
      setSheetOpen(false);
      try {
        const ctl = await fetchCtlAtlTsb(42);
        const ctx = buildInsightContext({
          ctlPoints: ctl.items ?? [],
          current: ctl.current,
          activityDates: [],
          stretchRecent: false,
          streak: 0,
          kcalToday: 0,
          proteinToday: 0,
          isFemale: false,
        });
        const tip = generatePostWorkoutInsights(ctx, {
          kind: 'cardio',
          title: CARDIO_TYPES.find(t => t.id === form.type)?.label || 'Кардио',
        })[0];
        if (tip) {
          Alert.alert(tip.title, tip.body);
        }
      } catch {
        // optional
      }
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({id, body}: {id: number; body: Parameters<typeof updateCardioWorkout>[1]}) =>
      updateCardioWorkout(id, body),
    onSuccess: async () => {
      notifySave();
      await invalidate();
      setSheetOpen(false);
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCardioWorkout,
    onSuccess: invalidate,
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const saveForm = () => {
    const min = Number(form.durationMin) || 0;
    const isPool = form.type === 'бассейн';
    const body = {
      date: form.date,
      type: form.type,
      distance_km: Number(form.distance) || 0,
      duration_min: min,
      duration_sec: 0,
      avg_hr: form.avgHr.trim() ? Number(form.avgHr) : undefined,
      max_hr: form.maxHr.trim() ? Number(form.maxHr) : undefined,
      calories_watch: form.caloriesWatch.trim() ? Number(form.caloriesWatch) : undefined,
      swolf: isPool && form.swolf.trim() ? Number(form.swolf) : undefined,
    };
    if (editing) {
      updateMutation.mutate({id: editing.id, body});
    } else {
      createMutation.mutate(body);
    }
  };

  const allItems = useMemo(() => workoutsQuery.data?.items ?? [], [workoutsQuery.data?.items]);
  const items = useMemo(() => allItems.slice(0, listLimit), [allItems, listLimit]);
  const hasMore = allItems.length > listLimit;
  const saving = createMutation.isPending || updateMutation.isPending;

  const sourceLabel = (item: CardioWorkout) => {
    const ds = (item.data_source || '').toLowerCase();
    if (ds.includes('polar')) {
      return 'Polar';
    }
    if (ds.includes('health') || ds.includes('connect') || ds.includes('hc')) {
      return 'Health Connect';
    }
    if (ds.includes('import') || ds.includes('fit')) {
      return 'Импорт';
    }
    return 'Вручную';
  };

  const renderItem = useCallback(({item}: {item: CardioWorkout}) => (
    <AppCard padding="md" style={styles.cardGap}>
      <Pressable onPress={() => navigation.navigate('CardioDetail', {workoutId: item.id})}>
        <View style={styles.badgeRow}>
          <AppChip label={sourceLabel(item)} variant="pill" />
          {item.avg_hr != null ? (
            <AppChip label={`Пульс ${item.avg_hr}`} variant="pill" />
          ) : (
            <AppChip label="Без пульса" variant="pill" />
          )}
        </View>
        <AppText variant="title2">{item.date}</AppText>
        <AppText variant="body" color="textSecondary">
          {CARDIO_TYPES.find(t => t.id === item.type)?.label || item.type} · {item.distance_km} км · {formatDuration(item.duration_sec)}
        </AppText>
      </Pressable>
      <View style={styles.row}>
        <AppButton
          label="Детали"
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('CardioDetail', {workoutId: item.id})}
        />
        <AppButton label="Изменить" variant="secondary" size="sm" onPress={() => openEdit(item)} />
        <AppButton
          label="Удалить"
          variant="danger"
          size="sm"
          onPress={() =>
            Alert.alert('Удалить тренировку?', '', [
              {text: 'Отмена', style: 'cancel'},
              {
                text: 'Удалить',
                style: 'destructive',
                onPress: () => deleteMutation.mutate(item.id),
              },
            ])
          }
        />
      </View>
    </AppCard>
  ), [navigation, deleteMutation]);

  return (
    <View style={styles.root}>
      <WorkoutPeriodFilter value={period} onChange={setPeriod} />
      {typeOptions.length > 0 ? (
        <View style={styles.chipRow}>
          <AppChip
            label="Все типы"
            variant="pill"
            active={!typeFilter}
            onPress={() => setTypeFilter(null)}
          />
          {typeOptions.map(t => (
            <AppChip
              key={t.id}
              label={t.label}
              variant="pill"
              active={typeFilter === t.id}
              onPress={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
            />
          ))}
        </View>
      ) : null}

      <AppButton label="Добавить кардио" icon="add" onPress={openCreate} fullWidth />

      {workoutsQuery.isLoading ? <AppLoadingState label="Загрузка…" compact /> : null}
      {workoutsQuery.error ? (
        <AppErrorState
          message="Не удалось загрузить кардио"
          onRetry={() => workoutsQuery.refetch()}
          compact
        />
      ) : null}

      {!workoutsQuery.isLoading && !workoutsQuery.error ? (
        <FlatList
          data={items}
          keyExtractor={w => String(w.id)}
          renderItem={renderItem}
          scrollEnabled={false}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={<AppEmptyState title="Нет кардио-тренировок" compact />}
          ListFooterComponent={
            hasMore ? (
              <AppButton
                label={`Показать ещё (${allItems.length - listLimit})`}
                variant="secondary"
                size="sm"
                onPress={() => setListLimit(n => n + 50)}
                fullWidth
              />
            ) : null
          }
        />
      ) : null}

      <AppSheet
        visible={sheetOpen}
        title={editing ? 'Редактировать кардио' : 'Новая кардио-тренировка'}
        onClose={() => setSheetOpen(false)}>
        <View style={styles.form}>
          <AppInput label="Дата" value={form.date} onChangeText={v => setForm(f => ({...f, date: v}))} />
          <AppText variant="caption" color="textSecondary">
            Тип
          </AppText>
          <View style={styles.chipRow}>
            {CARDIO_TYPES.map(t => (
              <AppChip
                key={t.id}
                label={t.label}
                variant="pill"
                active={form.type === t.id}
                onPress={() => setForm(f => ({...f, type: t.id}))}
              />
            ))}
          </View>
          <AppInput
            label="Дистанция, км"
            value={form.distance}
            onChangeText={v => setForm(f => ({...f, distance: v}))}
            keyboardType="decimal-pad"
          />
          <AppInput
            label="Длительность, мин"
            value={form.durationMin}
            onChangeText={v => setForm(f => ({...f, durationMin: v}))}
            keyboardType="number-pad"
          />
          <AppInput
            label="Средний пульс (необязательно)"
            value={form.avgHr}
            onChangeText={v => setForm(f => ({...f, avgHr: v}))}
            keyboardType="number-pad"
          />
          <AppInput
            label="Максимальный пульс (необязательно)"
            value={form.maxHr}
            onChangeText={v => setForm(f => ({...f, maxHr: v}))}
            keyboardType="number-pad"
          />
          <AppInput
            label="Калории с часов (необязательно)"
            value={form.caloriesWatch}
            onChangeText={v => setForm(f => ({...f, caloriesWatch: v}))}
            keyboardType="number-pad"
          />
          {form.type === 'бассейн' ? (
            <AppInput
              label="SWOLF (необязательно)"
              value={form.swolf}
              onChangeText={v => setForm(f => ({...f, swolf: v}))}
              keyboardType="number-pad"
            />
          ) : null}
          {form.type === 'бег' ? (
            <AppText variant="caption" color="textSecondary">
              Темп / скорость: {formatPacePreview(Number(form.distance), Number(form.durationMin))} ·{' '}
              {formatSpeedPreview(Number(form.distance), Number(form.durationMin))}
            </AppText>
          ) : null}
          {form.type === 'вело' ? (
            <AppText variant="caption" color="textSecondary">
              Средняя скорость: {formatSpeedPreview(Number(form.distance), Number(form.durationMin))}
            </AppText>
          ) : null}
          <AppButton
            label={editing ? 'Сохранить' : 'Добавить'}
            onPress={saveForm}
            loading={saving}
            fullWidth
          />
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 12},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  badgeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6},
  row: {flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap'},
  cardGap: {marginBottom: 8},
  form: {gap: 12, paddingBottom: 16},
});
