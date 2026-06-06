import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {StrengthSession} from '../../api/workouts';
import {AppCard} from '../../design-system/components/AppCard';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {
  formatDateShort,
  formatVolume,
  sessionSetCount,
  sessionVolume,
} from '../../utils/workoutStats';

type Props = {
  session: StrengthSession;
  onPress: () => void;
  enterIndex?: number;
};

export function WorkoutHistoryCard({session, onPress, enterIndex = 0}: Props) {
  const {colors, typography, space, iconSize} = useDesignSystem();
  const vol = sessionVolume(session);
  const sets = sessionSetCount(session);

  return (
    <AppCard onPress={onPress} enterIndex={enterIndex}>
      <View style={styles.row}>
        <View style={[styles.dateCol, {backgroundColor: colors.accentMuted}]}>
          <Text style={[typography.caption, {color: colors.accent, fontWeight: '800'}]}>
            {formatDateShort(session.date)}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={[typography.title3, {color: colors.text}]} numberOfLines={1}>
            {session.workout_title}
          </Text>
          <View style={[styles.meta, {gap: space[2]}]}>
            <Meta icon="barbell-outline" label={`${sets} подх.`} colors={colors} />
            <Meta icon="analytics-outline" label={formatVolume(vol)} colors={colors} />
            {session.is_circuit ? (
              <Meta icon="repeat-outline" label="круг" colors={colors} />
            ) : null}
          </View>
        </View>
        <Icon name="chevron-forward" size={iconSize.md} color={colors.textMuted} />
      </View>
    </AppCard>
  );
}

function Meta({
  icon,
  label,
  colors,
}: {
  icon: string;
  label: string;
  colors: {textMuted: string};
}) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={12} color={colors.textMuted} />
      <Text style={{fontSize: 11, color: colors.textMuted, fontWeight: '600'}}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  dateCol: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  body: {flex: 1, minWidth: 0, gap: 4},
  meta: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  metaItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
});
