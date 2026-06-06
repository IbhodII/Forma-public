import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppChip} from '../../design-system/components/AppChip';
import type {WorkoutPeriodDays} from '../../utils/workoutPeriod';
import {WORKOUT_PERIOD_OPTIONS} from '../../utils/workoutPeriod';

type Props = {
  value: WorkoutPeriodDays;
  onChange: (v: WorkoutPeriodDays) => void;
};

export function WorkoutPeriodFilter({value, onChange}: Props) {
  return (
    <View style={styles.row}>
      {WORKOUT_PERIOD_OPTIONS.map(opt => (
        <AppChip
          key={opt.id}
          label={opt.label}
          variant="pill"
          active={value === opt.id}
          onPress={() => onChange(opt.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
