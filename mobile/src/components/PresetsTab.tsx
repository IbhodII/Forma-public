import React, {useState} from 'react';
import {ActivityIndicator, Alert, FlatList, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  archivePreset,
  createPreset,
  deletePreset,
  fetchAllPresets,
  restorePreset,
  type WorkoutPreset,
} from '../api/presetsApi';
import {AppButton, AppCard, AppChip, AppInput, AppSheet, AppText} from '../design-system';
import {fetchCardioTabSettings, archiveCardioTabType, restoreCardioTabType} from '../api/cardio';

export function PresetsTab() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [exerciseName, setExerciseName] = useState('');

  const presetsQuery = useQuery({
    queryKey: ['presets-all', showArchived],
    queryFn: () => fetchAllPresets(!showArchived ? true : undefined),
  });

  const cardioTabsQuery = useQuery({
    queryKey: ['cardio-tabs-presets', showArchived],
    queryFn: () => fetchCardioTabSettings(showArchived ? false : true),
  });

  const invalidate = async () => {
    await qc.invalidateQueries({queryKey: ['presets-all']});
    await qc.invalidateQueries({queryKey: ['cardio-tabs-presets']});
    await qc.invalidateQueries({queryKey: ['strength-presets']});
  };

  const archiveMut = useMutation({
    mutationFn: archivePreset,
    onSuccess: invalidate,
  });
  const restoreMut = useMutation({
    mutationFn: restorePreset,
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: deletePreset,
    onSuccess: invalidate,
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const archiveCardioMut = useMutation({
    mutationFn: archiveCardioTabType,
    onSuccess: invalidate,
  });
  const restoreCardioMut = useMutation({
    mutationFn: restoreCardioTabType,
    onSuccess: invalidate,
  });

  const createPresetMut = useMutation({
    mutationFn: () =>
      createPreset({
        name: presetName.trim(),
        exercises: exerciseName.trim()
          ? [{exercise: exerciseName.trim(), default_sets: 3, default_reps: '8-12'}]
          : [],
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setPresetName('');
      setExerciseName('');
      await invalidate();
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const renderStrength = ({item}: {item: WorkoutPreset}) => (
    <AppCard padding="md" style={[styles.cardGap, item.is_active === 0 && styles.archived]}>
      <AppText variant="title3">{item.name}</AppText>
      <AppText variant="caption" color="textSecondary">
        Силовой · {item.workout_count} тренировок
      </AppText>
      <View style={styles.row}>
        {item.is_active === 0 ? (
          <AppButton
            label="Восстановить"
            size="sm"
            variant="secondary"
            onPress={() => restoreMut.mutate(item.id)}
          />
        ) : (
          <AppButton
            label="Архивировать"
            size="sm"
            variant="secondary"
            onPress={() => archiveMut.mutate(item.id)}
          />
        )}
        {item.workout_count === 0 ? (
          <AppButton
            label="Удалить"
            size="sm"
            variant="danger"
            onPress={() =>
              Alert.alert('Удалить пресет?', item.name, [
                {text: 'Отмена', style: 'cancel'},
                {text: 'Удалить', style: 'destructive', onPress: () => deleteMut.mutate(item.id)},
              ])
            }
          />
        ) : null}
      </View>
    </AppCard>
  );

  return (
    <View style={styles.root}>
      <AppChip
        label={showArchived ? 'Скрыть архивные' : 'Показать архивные'}
        variant="pill"
        active={showArchived}
        onPress={() => setShowArchived(v => !v)}
      />

      <AppText variant="title3">Силовые пресеты</AppText>
      <AppButton label="Создать пресет" icon="add" size="sm" onPress={() => setCreateOpen(true)} />
      <AppSheet visible={createOpen} title="Новый силовой пресет" onClose={() => setCreateOpen(false)}>
        <AppInput label="Название" value={presetName} onChangeText={setPresetName} />
        <AppInput
          label="Первое упражнение (необязательно)"
          value={exerciseName}
          onChangeText={setExerciseName}
        />
        <AppText variant="caption" color="textSecondary">
          Кардио-типы появляются при первой записи тренировки этого типа.
        </AppText>
        <AppButton
          label="Создать"
          onPress={() => createPresetMut.mutate()}
          loading={createPresetMut.isPending}
          disabled={!presetName.trim()}
          fullWidth
        />
      </AppSheet>
      {presetsQuery.isLoading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={presetsQuery.data || []}
          keyExtractor={p => `s-${p.id}`}
          renderItem={renderStrength}
          ListEmptyComponent={
            <AppText variant="caption" color="textMuted" style={styles.empty}>
              Нет пресетов
            </AppText>
          }
        />
      )}

      <AppText variant="title3">Кардио-типы</AppText>
      {(cardioTabsQuery.data || []).map((tab: {type: string; is_active: number; workout_count: number}) => (
        <AppCard
          key={tab.type}
          padding="md"
          style={[styles.cardGap, tab.is_active === 0 && styles.archived]}>
          <AppText variant="title3">{tab.type}</AppText>
          <AppText variant="caption" color="textSecondary">
            Кардио · {tab.workout_count} тренировок
          </AppText>
          <View style={styles.row}>
            {tab.is_active === 0 ? (
              <AppButton
                label="Восстановить"
                size="sm"
                variant="secondary"
                onPress={() => restoreCardioMut.mutate(tab.type)}
              />
            ) : (
              <AppButton
                label="Архивировать"
                size="sm"
                variant="secondary"
                onPress={() => archiveCardioMut.mutate(tab.type)}
              />
            )}
          </View>
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, gap: 10},
  cardGap: {marginBottom: 8},
  archived: {opacity: 0.65},
  row: {flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap'},
  empty: {textAlign: 'center', marginTop: 16},
});
