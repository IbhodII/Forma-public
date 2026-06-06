import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchStrengthNextWorkoutSuggestion} from '../../../api/strength';
import type {WorkoutApproach} from '../../../strength/workoutApproaches';
import {AppCard} from '../../../design-system/components/AppCard';
import {AppButton} from '../../../design-system/components/AppButton';
import {AppInput} from '../../../design-system/components/AppInput';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import {WorkoutRecordSetRow} from './WorkoutRecordSetRow';

type Props = {
  exercise: string;
  indices: number[];
  approaches: WorkoutApproach[];
  workoutTitle: string;
  onRename: (name: string) => void;
  onAddSet: () => void;
  onAddWarmup: () => void;
  onRemoveExercise: () => void;
  onUpdateAt: (globalIndex: number, patch: Partial<WorkoutApproach>) => void;
  onDuplicateAt: (globalIndex: number) => void;
  onRemoveAt: (globalIndex: number) => void;
};

function SetSection({
  title,
  indices,
  approaches,
  onUpdateAt,
  onDuplicateAt,
  onRemoveAt,
}: {
  title: string;
  indices: number[];
  approaches: WorkoutApproach[];
  onUpdateAt: (globalIndex: number, patch: Partial<WorkoutApproach>) => void;
  onDuplicateAt: (globalIndex: number) => void;
  onRemoveAt: (globalIndex: number) => void;
}) {
  const {colors, typography, layout} = useDesignSystem();
  if (!indices.length) {
    return null;
  }
  return (
    <View style={{gap: layout.stackGap}}>
      <Text style={[typography.caption, {color: colors.textMuted}]}>{title}</Text>
      {indices.map((globalIdx, localIdx) => (
        <WorkoutRecordSetRow
          key={approaches[globalIdx]!.id}
          row={approaches[globalIdx]!}
          setNumber={localIdx + 1}
          onChange={patch => onUpdateAt(globalIdx, patch)}
          onDuplicate={() => onDuplicateAt(globalIdx)}
          onRemove={() => onRemoveAt(globalIdx)}
        />
      ))}
    </View>
  );
}

export function WorkoutRecordExerciseCard({
  exercise,
  indices,
  approaches,
  workoutTitle,
  onRename,
  onAddSet,
  onAddWarmup,
  onRemoveExercise,
  onUpdateAt,
  onDuplicateAt,
  onRemoveAt,
}: Props) {
  const {colors, typography, layout} = useDesignSystem();
  const lastHint = indices.map(i => approaches[i]?.lastHint).find(Boolean);

  const warmupIndices = useMemo(
    () => indices.filter(i => approaches[i]?.is_warmup),
    [indices, approaches],
  );
  const workingIndices = useMemo(
    () => indices.filter(i => !approaches[i]?.is_warmup),
    [indices, approaches],
  );

  const suggestionQuery = useQuery({
    queryKey: ['strength-next-suggestion', exercise, workoutTitle],
    queryFn: () =>
      fetchStrengthNextWorkoutSuggestion({
        exercise_name: exercise,
        workout_title: workoutTitle,
      }),
    enabled: Boolean(exercise.trim() && workoutTitle.trim()),
    staleTime: 60_000,
  });

  const suggestion = suggestionQuery.data?.message;

  return (
    <AppCard variant="elevated" animateEnter={false} style={{gap: layout.stackGap}}>
      <AppInput
        label="Упражнение"
        value={exercise}
        onChangeText={onRename}
        placeholder="Название"
      />
      {lastHint ? (
        <Text style={[typography.body, {color: colors.textSecondary, fontWeight: '600'}]}>
          Прошлый раз: {lastHint}
        </Text>
      ) : null}
      {suggestion ? (
        <Text style={[typography.caption, {color: colors.accent}]}>{suggestion}</Text>
      ) : null}

      <SetSection
        title="Разминка"
        indices={warmupIndices}
        approaches={approaches}
        onUpdateAt={onUpdateAt}
        onDuplicateAt={onDuplicateAt}
        onRemoveAt={onRemoveAt}
      />
      <SetSection
        title="Рабочие"
        indices={workingIndices}
        approaches={approaches}
        onUpdateAt={onUpdateAt}
        onDuplicateAt={onDuplicateAt}
        onRemoveAt={onRemoveAt}
      />

      <View style={styles.actions}>
        <AppButton label="+ Разминка" variant="secondary" size="sm" onPress={onAddWarmup} />
        <AppButton label="Добавить подход" variant="secondary" size="sm" onPress={onAddSet} />
        <AppButton label="Удалить упражнение" variant="ghost" size="sm" onPress={onRemoveExercise} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  actions: {gap: 8},
});
