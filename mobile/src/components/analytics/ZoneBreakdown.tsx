import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import type {ZoneTimeItem} from '../../api/analytics';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type Props = {
  zones: ZoneTimeItem[];
};

export function ZoneBreakdown({zones}: Props) {
  const {colors, typography, space, radius, chart} = useDesignSystem();

  if (!zones.length) {
    return (
      <Text style={[typography.caption, {color: colors.textMuted}]}>
        Нет данных по зонам пульса за выбранный период.
      </Text>
    );
  }

  return (
    <View style={{gap: space[2]}}>
      {zones.map((z, i) => (
        <View key={z.zone_id} style={{gap: 4}}>
          <View style={styles.row}>
            <Text style={[typography.caption, {color: colors.text, flex: 1}]} numberOfLines={1}>
              {z.name}
            </Text>
            <Text style={[typography.caption, {color: colors.textMuted}]}>
              {z.minutes.toFixed(0)} мин · {z.percent.toFixed(0)}%
            </Text>
          </View>
          <View style={[styles.track, {backgroundColor: colors.border, borderRadius: radius.pill}]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, Math.max(0, z.percent))}%`,
                  backgroundColor: chart.zones[i % chart.zones.length],
                  borderRadius: radius.pill,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  track: {height: 6, overflow: 'hidden'},
  fill: {height: 6},
});
