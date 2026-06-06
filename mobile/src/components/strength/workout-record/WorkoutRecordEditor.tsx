import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {groupApproachesByExercise} from '../../../strength/groupApproaches';
import type {WorkoutApproach} from '../../../strength/workoutApproaches';
import {AppButton} from '../../../design-system/components/AppButton';
import {AppCard} from '../../../design-system/components/AppCard';
import {AppInput} from '../../../design-system/components/AppInput';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import {WorkoutRecordExerciseCard} from './WorkoutRecordExerciseCard';
import {WorkoutRecordSetRow} from './WorkoutRecordSetRow';

type Props = {
  approaches: WorkoutApproach[];
  circuitWorkout: boolean;
  workoutTitle: string;
  onUpdateApproach: (index: number, patch: Partial<WorkoutApproach>) => void;
  onRemoveApproach: (index: number) => void;
  onDuplicateApproach: (index: number) => void;
  onAddExercise: () => void;
  onAddSetToExercise: (exercise: string) => void;
  onAddWarmupToExercise: (exercise: string) => void;
  onRenameExercise: (indices: number[], name: string) => void;
  onRemoveExercise: (indices: number[]) => void;
};

export function WorkoutRecordEditor({
  approaches,
  circuitWorkout,
  workoutTitle,
  onUpdateApproach,
  onRemoveApproach,
  onDuplicateApproach,
  onAddExercise,
  onAddSetToExercise,
  onAddWarmupToExercise,
  onRenameExercise,
  onRemoveExercise,
}: Props) {
  const {colors, typography, layout} = useDesignSystem();
  const groups = useMemo(() => groupApproachesByExercise(approaches), [approaches]);

  if (circuitWorkout) {
    return (
      <View style={{gap: layout.blockGap}}>
        <Text style={[typography.caption, {color: colors.textMuted}]}>
          Круговая тренировка — подходы в порядке выполнения
        </Text>
        {approaches.map((row, i) => (
          <AppCard key={row.id} variant="elevated" animateEnter={false} style={{gap: layout.stackGap}}>
            <AppInput
              label={`Шаг ${i + 1} · упражнение`}
              value={row.exercise}
              onChangeText={v => onUpdateApproach(i, {exercise: v})}
              placeholder="Название"
            />
            <WorkoutRecordSetRow
              row={row}
              setNumber={i + 1}
              onChange={patch => onUpdateApproach(i, patch)}
              onDuplicate={() => onDuplicateApproach(i)}
              onRemove={() => onRemoveApproach(i)}
            />
          </AppCard>
        ))}
        <AppButton label="Добавить подход" variant="secondary" onPress={onAddExercise} />
      </View>
    );
  }

  return (
    <View style={{gap: layout.blockGap}}>
      {groups.map(g => (
        <WorkoutRecordExerciseCard
          key={g.key}
          exercise={g.exercise}
          indices={g.indices}
          approaches={approaches}
          workoutTitle={workoutTitle}
          onRename={name => onRenameExercise(g.indices, name)}
          onAddSet={() => onAddSetToExercise(g.exercise.trim() || 'Упражнение')}
          onAddWarmup={() => onAddWarmupToExercise(g.exercise.trim() || 'Упражнение')}
          onRemoveExercise={() => onRemoveExercise(g.indices)}
          onUpdateAt={onUpdateApproach}
          onDuplicateAt={onDuplicateApproach}
          onRemoveAt={onRemoveApproach}
        />
      ))}
      <AppButton label="Добавить упражнение" icon="add" variant="secondary" onPress={onAddExercise} />
    </View>
  );
}

const styles = StyleSheet.create({});
