import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Line, Rect, Text as SvgText} from 'react-native-svg';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {formatAxisDate, pickTickIndices, sampleByIndex} from './utils';
import {useChartContainerWidth} from './useChartContainerWidth';

export type BarPoint = {date: string; value: number};

type Props = {
  points: BarPoint[];
  height: number;
  color: string;
  maxTicks?: number;
};

function chartPad(width: number) {
  const narrow = width > 0 && width < 340;
  return {
    left: narrow ? 30 : 36,
    right: 8,
    top: 12,
    bottom: narrow ? 22 : 26,
  };
}

function MobileBarChartInner({points, height, color, maxTicks = 4}: Props) {
  const {colors, typography, isDark} = useDesignSystem();
  const {width, onLayout, layoutKey, containerStyle} = useChartContainerWidth();

  const pad = chartPad(width);

  const chart = useMemo(() => {
    const PAD = pad;
    if (points.length === 0 || width < 40) {
      return null;
    }
    const effectiveTicks = width < 340 ? Math.min(3, maxTicks) : maxTicks;
    const sampled = sampleByIndex(points, Math.min(20, points.length));
    const tickIdx = pickTickIndices(sampled.length, effectiveTicks);
    const values = sampled.map(p => p.value);
    const maxY = Math.max(...values, 1);
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const barW = Math.max(4, (innerW / sampled.length) * 0.62);
    const gap = innerW / sampled.length;

    const bars = sampled.map((p, i) => {
      const h = (p.value / maxY) * innerH;
      const x = PAD.left + i * gap + (gap - barW) / 2;
      const y = PAD.top + innerH - h;
      return {x, y, w: barW, h, date: p.date};
    });

    return {bars, tickIdx, maxY, innerH, innerW, dates: sampled.map(p => p.date)};
  }, [points, width, height, maxTicks, pad]);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, containerStyle, {height}]}>
        <Text style={[typography.caption, {color: colors.textMuted}]}>Недостаточно данных</Text>
      </View>
    );
  }

  return (
    <View key={layoutKey} onLayout={onLayout} style={[styles.wrap, containerStyle, {height}]}>
      {width < 40 ? (
        <View style={[styles.empty, {height}]}>
          <Text style={[typography.caption, {color: colors.textMuted}]}>Загрузка графика…</Text>
        </View>
      ) : chart ? (
        <Svg width={width} height={height}>
          <Line
            x1={pad.left}
            y1={pad.top + chart.innerH}
            x2={width - pad.right}
            y2={pad.top + chart.innerH}
            stroke={colors.chartGrid}
            strokeWidth={1}
            opacity={isDark ? 1 : 0.8}
          />
          <SvgText
            x={pad.left - 6}
            y={pad.top + 4}
            fontSize={10}
            fill={colors.textMuted}
            textAnchor="end">
            {Math.round(chart.maxY)}
          </SvgText>
          {chart.bars.map((b, i) => (
            <Rect
              key={`bar-${i}`}
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(b.h, 2)}
              rx={3}
              fill={color}
              opacity={0.9}
            />
          ))}
          {chart.tickIdx.map(i => {
            const b = chart.bars[i];
            if (!b) {
              return null;
            }
            return (
              <SvgText
                key={`x-${i}`}
                x={b.x + b.w / 2}
                y={height - 6}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor="middle">
                {formatAxisDate(chart.dates[i]!)}
              </SvgText>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

export const MobileBarChart = React.memo(MobileBarChartInner);

const styles = StyleSheet.create({
  wrap: {overflow: 'hidden'},
  empty: {alignItems: 'center', justifyContent: 'center'},
});
