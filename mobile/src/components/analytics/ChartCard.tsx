import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {haptics} from '../../haptics';
import {AppCard} from '../../design-system/components/AppCard';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Props = {
  title: string;
  summary?: string;
  insight?: string;
  legend?: Array<{label: string; color: string}>;
  children: (opts: {expanded: boolean; chartHeight: number}) => React.ReactNode;
  defaultExpanded?: boolean;
  chartHeights?: {collapsed: number; expanded: number};
  minChartBoxHeight?: number;
};

export function ChartCard({
  title,
  summary,
  insight,
  legend,
  children,
  defaultExpanded = false,
  chartHeights,
  minChartBoxHeight,
}: Props) {
  const {colors, typography, layout, space, iconSize, isDark} = useDesignSystem();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const collapsedH = chartHeights?.collapsed ?? 160;
  const expandedH = chartHeights?.expanded ?? 172;
  const chartHeight = expanded ? expandedH : collapsedH;
  const boxMinHeight = minChartBoxHeight ?? 168;

  return (
    <AppCard variant="elevated" animateEnter={false} style={{gap: layout.stackGap}}>
      <PressableScale
        onPress={() => {
          haptics.selection();
          setExpanded(v => !v);
        }}
        haptic={false}
        scaleTo={0.99}>
        <View style={styles.head}>
          <View style={styles.titles}>
            <Text style={[typography.title3, {color: colors.text}]}>{title}</Text>
            {summary ? (
              <Text style={[typography.caption, {color: colors.textSecondary, marginTop: 2}]}>
                {summary}
              </Text>
            ) : null}
          </View>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={colors.textMuted}
          />
        </View>
      </PressableScale>
      {insight ? (
        <Text style={[typography.caption, {color: colors.textMuted}]}>{insight}</Text>
      ) : null}
      {legend && legend.length > 0 ? (
        <View style={[styles.legend, {gap: space[2]}]}>
          {legend.map(l => (
            <View key={l.label} style={styles.legendItem}>
              <View style={[styles.swatch, {backgroundColor: l.color}]} />
              <Text style={[typography.caption, {color: colors.textMuted}]}>{l.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View
        style={[
          styles.chartBox,
          {
            minHeight: boxMinHeight,
            backgroundColor: isDark ? colors.chartWell : colors.surfaceMuted,
            borderRadius: layout.cardPadding,
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent',
          },
        ]}>
        <View style={styles.chartInner}>
          {children({expanded, chartHeight})}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8},
  titles: {flex: 1, minWidth: 0},
  legend: {flexDirection: 'row', flexWrap: 'wrap'},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6},
  swatch: {width: 8, height: 8, borderRadius: 4},
  chartBox: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    paddingTop: 6,
    paddingBottom: 2,
  },
  chartInner: {width: '100%', minWidth: 0},
});
