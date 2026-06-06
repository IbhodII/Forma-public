import React from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {WorkoutApproach} from '../../../strength/workoutApproaches';
import {AppInput} from '../../../design-system/components/AppInput';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import {PressableScale} from '../../../design-system/motion/PressableScale';

type Props = {
  row: WorkoutApproach;
  setNumber: number;
  onChange: (patch: Partial<WorkoutApproach>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

export function WorkoutRecordSetRow({
  row,
  setNumber,
  onChange,
  onDuplicate,
  onRemove,
}: Props) {
  const {colors, typography, layout, space, iconSize, touch, radius} = useDesignSystem();

  return (
    <View
      style={[
        styles.row,
        {
          gap: layout.stackGap,
          minHeight: 48,
          padding: layout.cardPadding,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}>
      <View style={styles.head}>
        <Text style={[typography.caption, {color: colors.accent, fontWeight: '700'}]}>
          Подход {setNumber}
        </Text>
        <View style={styles.headActions}>
          <PressableScale onPress={onDuplicate} scaleTo={0.92} haptic={false}>
            <View style={[styles.iconBtn, {minWidth: touch.minWidth, minHeight: touch.minHeight}]}>
              <Icon name="copy-outline" size={iconSize.md} color={colors.textMuted} />
            </View>
          </PressableScale>
          <PressableScale onPress={onRemove} scaleTo={0.92} haptic={false}>
            <View style={[styles.iconBtn, {minWidth: touch.minWidth, minHeight: touch.minHeight}]}>
              <Icon name="trash-outline" size={iconSize.md} color={colors.danger} />
            </View>
          </PressableScale>
        </View>
      </View>

      <View style={styles.warmupRow}>
        <Text style={[typography.caption, {color: colors.textSecondary}]}>Разминка</Text>
        <Switch
          value={row.is_warmup}
          onValueChange={v => onChange({is_warmup: v})}
          trackColor={{false: colors.border, true: colors.accent}}
        />
      </View>

      {row.is_bodyweight ? (
        <AppInput
          label="Время (сек)"
          value={row.duration_sec}
          onChangeText={v => onChange({duration_sec: v})}
          keyboardType="number-pad"
        />
      ) : (
        <View style={[styles.fields, {gap: space[2]}]}>
          <View style={styles.fieldHalf}>
            <AppInput
              label="Вес (кг)"
              value={row.weight}
              onChangeText={v => onChange({weight: v})}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldHalf}>
            <AppInput
              label="Повторы"
              value={row.reps}
              onChangeText={v => onChange({reps: v})}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {width: '100%', maxWidth: '100%'},
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  headActions: {flexDirection: 'row', alignItems: 'center', gap: 4},
  iconBtn: {alignItems: 'center', justifyContent: 'center'},
  warmupRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  fields: {flexDirection: 'row', width: '100%'},
  fieldHalf: {flex: 1, minWidth: 0},
});
