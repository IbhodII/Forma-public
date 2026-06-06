import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Switch, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  archiveStretchingPreset,
  createStretchingPreset,
  fetchStretchingExercises,
  fetchStretchingPresets,
  updateStretchingPreset,
} from '../api/stretching';
import type {StretchingExercise, StretchingPreset, StretchingPresetExercise} from '../types/stretching';
import {AppButton, AppCard, AppChip, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';

type Props = {
  onStartSession: (presetId: number) => void;
};

export function StretchingPresetsTab({onStartSession}: Props) {
  const {colors, layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StretchingPreset | null>(null);
  const [name, setName] = useState('');
  const [exerciseRows, setExerciseRows] = useState<StretchingPresetExercise[]>([]);

  const activeQuery = useQuery({
    queryKey: ['stretching-presets', true],
    queryFn: () => fetchStretchingPresets(true),
  });
  const archivedQuery = useQuery({
    queryKey: ['stretching-presets', false],
    queryFn: () => fetchStretchingPresets(false),
    enabled: showArchived,
  });
  const exercisesQuery = useQuery({
    queryKey: ['stretching-exercises-options'],
    queryFn: () => fetchStretchingExercises(),
  });

  const presets = useMemo(() => {
    const active = activeQuery.data || [];
    const archived = showArchived ? archivedQuery.data || [] : [];
    return [...active, ...archived];
  }, [activeQuery.data, archivedQuery.data, showArchived]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        exercises: exerciseRows
          .filter(e => e.exercise_id > 0)
          .map((e, idx) => ({
            exercise_id: e.exercise_id,
            hold_seconds: Number(e.hold_seconds) || 30,
            reps: Number(e.reps) || 1,
            notes: e.notes || '',
            exercise_order: idx,
          })),
      };
      if (editing) {
        return updateStretchingPreset(editing.id, payload);
      }
      return createStretchingPreset(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['stretching-presets']});
      setModalOpen(false);
      setEditing(null);
      setName('');
      setExerciseRows([]);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveStretchingPreset(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['stretching-presets']});
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setExerciseRows([{exercise_id: 0, hold_seconds: 30, reps: 1, notes: '', exercise_order: 0}]);
    setModalOpen(true);
  };

  const openEdit = (preset: StretchingPreset) => {
    setEditing(preset);
    setName(preset.name);
    setExerciseRows(
      (preset.exercises || []).map((e, idx) => ({
        ...e,
        exercise_order: idx,
      })),
    );
    setModalOpen(true);
  };

  return (
    <View style={[styles.root, {gap: layout.blockGap}]}>
      <View style={styles.header}>
        <AppText variant="title2">Пресеты растяжки</AppText>
        <AppButton label="+ Новый" size="sm" onPress={openCreate} />
      </View>
      <View style={styles.switchRow}>
        <AppText variant="body">Показать архивные</AppText>
        <Switch value={showArchived} onValueChange={setShowArchived} />
      </View>

      {(activeQuery.isLoading || archivedQuery.isLoading) && (
        <ActivityIndicator color={colors.accent} />
      )}

      <ScrollView
        style={styles.flexScroll}
        contentContainerStyle={[styles.list, {paddingBottom: listBottomPad}]}>
        {presets.map(preset => (
          <AppCard key={preset.id} padding="md" style={styles.card}>
            <AppText variant="title3">
              {preset.name} {preset.is_active ? '' : '(архив)'}
            </AppText>
            <AppText variant="caption" color="textMuted">
              Упражнений: {preset.exercise_count}
            </AppText>
            <View style={styles.cardActions}>
              <AppButton
                label="Начать тренировку"
                variant="secondary"
                size="sm"
                onPress={() => onStartSession(preset.id)}
              />
              <AppButton label="Редактировать" variant="secondary" size="sm" onPress={() => openEdit(preset)} />
              {!!preset.is_active && (
                <AppButton
                  label="Архивировать"
                  variant="ghost"
                  size="sm"
                  onPress={() => archiveMutation.mutate(preset.id)}
                />
              )}
            </View>
          </AppCard>
        ))}
      </ScrollView>

      <AppSheet
        visible={modalOpen}
        title={editing ? 'Редактировать пресет' : 'Новый пресет'}
        onClose={() => setModalOpen(false)}
        scroll>
        <AppInput value={name} onChangeText={setName} placeholder="Название пресета" />

        {exerciseRows.map((row, idx) => (
          <AppCard key={`row-${idx}`} padding="md" style={styles.exerciseRow}>
            <AppText variant="title3">Упражнение #{idx + 1}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipsRow}>
                {(exercisesQuery.data || []).map((ex: StretchingExercise) => (
                  <AppChip
                    key={ex.id}
                    label={ex.name}
                    variant="pill"
                    active={row.exercise_id === ex.id}
                    onPress={() =>
                      setExerciseRows(prev =>
                        prev.map((it, i) => (i === idx ? {...it, exercise_id: ex.id} : it)),
                      )
                    }
                  />
                ))}
              </View>
            </ScrollView>
            <View style={styles.inlineInputs}>
              <View style={styles.smallInput}>
                <AppInput
                  keyboardType="number-pad"
                  value={String(row.hold_seconds)}
                  placeholder="сек"
                  onChangeText={v =>
                    setExerciseRows(prev =>
                      prev.map((it, i) =>
                        i === idx ? {...it, hold_seconds: Number(v) || 0} : it,
                      ),
                    )
                  }
                />
              </View>
              <View style={styles.smallInput}>
                <AppInput
                  keyboardType="number-pad"
                  value={String(row.reps)}
                  placeholder="повт"
                  onChangeText={v =>
                    setExerciseRows(prev =>
                      prev.map((it, i) => (i === idx ? {...it, reps: Number(v) || 0} : it)),
                    )
                  }
                />
              </View>
            </View>
            <AppInput
              value={row.notes}
              placeholder="Заметки"
              onChangeText={v =>
                setExerciseRows(prev => prev.map((it, i) => (i === idx ? {...it, notes: v} : it)))
              }
            />
          </AppCard>
        ))}

        <View style={styles.footer}>
          <AppButton
            label="+ Упражнение"
            variant="secondary"
            size="sm"
            onPress={() =>
              setExerciseRows(prev => [
                ...prev,
                {
                  exercise_id: 0,
                  hold_seconds: 30,
                  reps: 1,
                  notes: '',
                  exercise_order: prev.length,
                },
              ])
            }
          />
          <AppButton label="Отмена" variant="secondary" size="sm" onPress={() => setModalOpen(false)} />
          <AppButton
            label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
            size="sm"
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          />
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  flexScroll: {flex: 1},
  list: {gap: 10},
  card: {marginBottom: 0},
  cardActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  exerciseRow: {marginBottom: 0},
  inlineInputs: {flexDirection: 'row', gap: 8},
  smallInput: {flex: 1},
  chipsRow: {flexDirection: 'row', gap: 6, paddingVertical: 8},
  footer: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
