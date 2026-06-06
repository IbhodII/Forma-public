import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Alert, FlatList, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  addExerciseToCatalog,
  createWorkoutType,
  fetchExerciseCatalog,
  fetchExerciseSetEditor,
  renameExerciseGlobally,
  saveExerciseSet,
} from '../api/exercisesCatalog';
import {fetchWorkoutTypes} from '../api/workouts';
import {useOffline} from '../context/OfflineContext';
import {AppButton, AppCard, AppChip, AppInput, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

export function ExercisesTab() {
  const {colors, layout} = useDesignSystem();
  const {isOnline} = useOffline();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const catalogQuery = useQuery({
    queryKey: ['exercise-catalog'],
    queryFn: fetchExerciseCatalog,
  });

  const typesQuery = useQuery({
    queryKey: ['strength-workout-types'],
    queryFn: fetchWorkoutTypes,
  });

  const editorQuery = useQuery({
    queryKey: ['exercise-set-editor', selectedType],
    queryFn: () =>
      fetchExerciseSetEditor(selectedType, new Date().toISOString().slice(0, 10)),
    enabled: Boolean(selectedType) && isOnline,
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = catalogQuery.data || [];
    if (!q) {
      return list;
    }
    return list.filter((n: string) => n.toLowerCase().includes(q));
  }, [catalogQuery.data, filter]);

  const addMut = useMutation({
    mutationFn: addExerciseToCatalog,
    onSuccess: async () => {
      setNewName('');
      await qc.invalidateQueries({queryKey: ['exercise-catalog']});
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const renameMut = useMutation({
    mutationFn: () => renameExerciseGlobally(renameFrom.trim(), renameTo.trim()),
    onSuccess: async () => {
      setRenameFrom('');
      setRenameTo('');
      await qc.invalidateQueries({queryKey: ['exercise-catalog']});
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const createTypeMut = useMutation({
    mutationFn: () =>
      createWorkoutType({
        workout_type: newTypeName.trim(),
        effective_from: new Date().toISOString().slice(0, 10),
        exercises: [],
      }),
    onSuccess: async () => {
      setNewTypeName('');
      await qc.invalidateQueries({queryKey: ['strength-workout-types']});
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const saveSetMut = useMutation({
    mutationFn: () =>
      saveExerciseSet({
        workout_type: selectedType,
        effective_from: new Date().toISOString().slice(0, 10),
        active_exercises: editorQuery.data?.active_exercises || [],
      }),
    onSuccess: () => Alert.alert('Сохранено', 'Набор упражнений обновлён'),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  return (
    <View style={[styles.root, {gap: layout.blockGapCompact}]}>
      {!isOnline ? (
        <View style={[styles.offlineHint, {backgroundColor: colors.warningMuted}]}>
          <AppText variant="caption" color="warning">
            Редактирование справочника доступно только онлайн. Просмотр — из кэша.
          </AppText>
        </View>
      ) : null}

      <AppInput placeholder="Поиск упражнения" value={filter} onChangeText={setFilter} />

      <View style={styles.row}>
        <View style={styles.flex}>
          <AppInput
            placeholder="Новое упражнение"
            value={newName}
            onChangeText={setNewName}
            editable={isOnline}
          />
        </View>
        <AppButton
          label="Добавить"
          variant="secondary"
          size="sm"
          disabled={!isOnline}
          onPress={() => addMut.mutate(newName)}
        />
      </View>

      {catalogQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={n => n}
          style={styles.list}
          renderItem={({item}) => (
            <AppButton
              label={item}
              variant="ghost"
              onPress={() => {
                setRenameFrom(item);
                setSelectedType(typesQuery.data?.[0] || '');
              }}
            />
          )}
        />
      )}

      <AppText variant="title3">Переименовать глобально</AppText>
      <AppInput
        value={renameFrom}
        onChangeText={setRenameFrom}
        placeholder="Старое имя"
        editable={isOnline}
      />
      <AppInput value={renameTo} onChangeText={setRenameTo} placeholder="Новое имя" editable={isOnline} />
      <AppButton
        label="Переименовать"
        disabled={!isOnline}
        onPress={() => renameMut.mutate()}
      />

      <AppText variant="title3">Типы тренировок</AppText>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppInput
            placeholder="Новый тип"
            value={newTypeName}
            onChangeText={setNewTypeName}
            editable={isOnline}
          />
        </View>
        <AppButton
          label="Создать"
          variant="secondary"
          size="sm"
          disabled={!isOnline}
          onPress={() => createTypeMut.mutate()}
        />
      </View>
      <View style={styles.chips}>
        {(typesQuery.data || []).map((t: string) => (
          <AppChip
            key={t}
            label={t}
            variant="pill"
            active={selectedType === t}
            onPress={() => setSelectedType(t)}
          />
        ))}
      </View>

      {selectedType && editorQuery.data ? (
        <AppCard padding="md">
          <AppText variant="title3">Набор: {selectedType}</AppText>
          <AppText variant="caption" color="textMuted">
            Упражнений: {editorQuery.data.active_exercises.length}
          </AppText>
          <AppButton
            label="Сохранить набор"
            size="sm"
            disabled={!isOnline}
            onPress={() => saveSetMut.mutate()}
          />
        </AppCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  offlineHint: {padding: 8, borderRadius: 12},
  row: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  flex: {flex: 1},
  list: {maxHeight: 200},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
});
