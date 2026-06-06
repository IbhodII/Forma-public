import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {workloadAccent} from '../../design-system/brand';
import {AppCard} from '../../design-system/components/AppCard';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import type {WorkloadInsight} from './utils';

type Props = {
  insight: WorkloadInsight;
  metrics?: Array<{label: string; value: string; hint?: string}>;
};

export function InsightBanner({insight, metrics}: Props) {
  const {colors, typography, layout, space, radius} = useDesignSystem();

  const accent = workloadAccent(insight.status, colors);

  return (
    <AppCard variant="brand" animateEnter={false} style={{gap: layout.stackGap}}>
      <View style={styles.row}>
        <View style={[styles.dot, {backgroundColor: accent, borderRadius: radius.pill}]} />
        <View style={styles.copy}>
          <Text style={[typography.overline, {color: colors.textMuted}]}>Состояние</Text>
          <Text style={[typography.title2, {color: colors.text}]}>{insight.title}</Text>
          <Text style={[typography.caption, {color: colors.textSecondary, marginTop: space[1]}]}>
            {insight.body}
          </Text>
        </View>
      </View>
      {metrics && metrics.length > 0 ? (
        <View style={[styles.metrics, {gap: space[2]}]}>
          {metrics.map(m => (
            <View key={m.label} style={[styles.metric, {backgroundColor: colors.surfaceMuted}]}>
              <Text style={[typography.label, {color: colors.textMuted}]}>{m.label}</Text>
              <Text style={[typography.title3, {color: colors.text, marginTop: 2}]}>{m.value}</Text>
              {m.hint ? (
                <Text style={[typography.caption, {color: colors.textMuted, marginTop: 1}]}>
                  {m.hint}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  dot: {width: 8, height: 8, marginTop: 6},
  copy: {flex: 1, minWidth: 0},
  metrics: {flexDirection: 'row', flexWrap: 'wrap'},
  metric: {
    flexGrow: 1,
    minWidth: '30%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
