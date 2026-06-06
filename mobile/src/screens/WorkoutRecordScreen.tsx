import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import {WorkoutRecordEditor} from '../components/strength/workout-record/WorkoutRecordEditor';
import {WorkoutRecordFooter} from '../components/strength/workout-record/WorkoutRecordFooter';
import {WorkoutRecordHeader} from '../components/strength/workout-record/WorkoutRecordHeader';
import {AppScreen} from '../design-system/components/AppScreen';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useStrengthWorkoutRecord} from '../hooks/useStrengthWorkoutRecord';
import {haptics, notifySave} from '../haptics';
import type {WorkoutsStackParamList} from '../navigation/WorkoutsStack';

type Props = NativeStackScreenProps<WorkoutsStackParamList, 'WorkoutRecord'>;

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WorkoutRecordScreen({navigation, route}: Props) {
  const {workoutTitle, presetId, date, edit} = route.params;
  const {colors, typography, iconSize} = useDesignSystem();
  const record = useStrengthWorkoutRecord({workoutTitle, presetId, date, edit});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedLabel = useMemo(
    () => formatElapsed(Math.floor((Date.now() - record.sessionStartedAt) / 1000)),
    [record.sessionStartedAt, tick],
  );

  const onSave = async () => {
    const ok = await record.submit();
    if (ok) {
      haptics.success();
      notifySave();
      navigation.goBack();
    } else {
      haptics.warning();
    }
  };

  const headerRight = (
    <Pressable
      onPress={() => navigation.goBack()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Назад">
      <Icon name="close" size={iconSize.lg} color={colors.text} />
    </Pressable>
  );

  if (record.loading) {
    return (
      <AppScreen title={edit ? 'Редактирование' : 'Запись'} rightAction={headerRight} scroll={false}>
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={edit ? 'Редактирование' : 'Запись тренировки'}
      subtitle={record.title}
      rightAction={headerRight}
      keyboardAvoiding
      stickyFooter={
        <WorkoutRecordFooter
          saving={record.saving}
          error={record.formError}
          onSave={() => void onSave()}
          onCancel={() => navigation.goBack()}
        />
      }>
      <WorkoutRecordHeader
        date={record.date}
        onDateChange={record.setDate}
        title={record.title}
        onTitleChange={record.setTitle}
        avgHr={record.avgHr}
        onAvgHrChange={record.setAvgHr}
        kcalChest={record.kcalChest}
        onKcalChestChange={record.setKcalChest}
        kcalWatch={record.kcalWatch}
        onKcalWatchChange={record.setKcalWatch}
        circuitWorkout={record.circuitWorkout}
        onCircuitChange={record.setCircuitWorkout}
        elapsedLabel={elapsedLabel}
      />
      {record.approaches.length === 0 ? (
        <Text style={[typography.body, {color: colors.textMuted}]}>
          Добавьте упражнение, чтобы начать запись.
        </Text>
      ) : null}
      <WorkoutRecordEditor
        approaches={record.approaches}
        circuitWorkout={record.circuitWorkout}
        workoutTitle={record.title}
        onUpdateApproach={record.updateApproach}
        onRemoveApproach={record.removeApproach}
        onDuplicateApproach={record.duplicateApproach}
        onAddExercise={() => record.addApproach()}
        onAddSetToExercise={record.addSetToExercise}
        onAddWarmupToExercise={record.addWarmupToExercise}
        onRenameExercise={record.renameExercise}
        onRemoveExercise={record.removeExercise}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loader: {marginTop: 24},
});
