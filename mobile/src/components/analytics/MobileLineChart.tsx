import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Path, Text as SvgText} from 'react-native-svg';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {formatAxisDate, pickTickIndices, sampleByIndex} from './utils';
import {useChartContainerWidth} from './useChartContainerWidth';

export type LinePoint = {date: string; value: number};

export type LineSeries = {
  key: string;
  color: string;
  points: LinePoint[];
};

type Props = {
  series: LineSeries[];
  height: number;
  maxTicks?: number;
  /** Max points per series after sampling (default 24). HR charts may use ~120. */
  maxPoints?: number;
  yFormatter?: (v: number) => string;
};

function chartPad(width: number) {
  const narrow = width > 0 && width < 340;
  return {
    left: narrow ? 34 : 40,
    right: 8,
    top: 12,
    bottom: narrow ? 22 : 26,
  };
}

function smoothPath(points: {x: number; y: number}[]): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${points[0]!.x} ${points[0]!.y}`;
  }
  let d = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function MobileLineChartInner({series, height, maxTicks = 4, maxPoints = 24, yFormatter}: Props) {
  const tickCap = maxTicks;
  const {colors, typography, isDark} = useDesignSystem();
  const {width, onLayout, layoutKey, containerStyle} = useChartContainerWidth();

  const pad = chartPad(width);

  const chart = useMemo(() => {
    const PAD = pad;
    const primary = series.find(s => s.points.length > 0);
    if (!primary || width < 40) {
      return null;
    }

    const effectiveTicks = width < 340 ? Math.min(3, tickCap) : tickCap;
    const cap = Math.min(maxPoints, primary.points.length);
    const sampled = sampleByIndex(primary.points, cap);
    const tickIdx = pickTickIndices(sampled.length, effectiveTicks);
    const dates = sampled.map(p => p.date);
    const n = sampled.length;

    const allValues = series.flatMap(s =>
      sampleByIndex(s.points, sampled.length).map(p => p.value),
    );
    const minY = Math.min(...allValues);
    const maxY = Math.max(...allValues);
    const range = maxY - minY || 1;
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;

    const xAt = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * innerW;
    const yAt = (v: number) => PAD.top + innerH - ((v - minY) / range) * innerH;

    const paths = series
      .filter(s => s.points.length > 0)
      .map(s => {
        const pts = sampleByIndex(s.points, sampled.length).map((p, i) => ({
          x: xAt(i),
          y: yAt(p.value),
        }));
        return {key: s.key, color: s.color, d: smoothPath(pts), last: pts[pts.length - 1]};
      });

    const yMid = (minY + maxY) / 2;
    const yLabels = [maxY, yMid, minY].map(v => ({
      v,
      label: yFormatter ? yFormatter(v) : Math.round(v).toString(),
      y: yAt(v),
    }));

    return {paths, tickIdx, dates, yLabels, innerW, innerH, n};
  }, [series, width, height, tickCap, maxPoints, yFormatter, pad]);

  const hasData = series.some(s => s.points.length > 1);

  if (!hasData) {
    return (
      <View style={[styles.empty, containerStyle, {height}]}>
        <Text style={[typography.caption, {color: colors.textMuted}]}>
          Недостаточно точек для графика
        </Text>
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
          {chart.yLabels.map((yl, i) => (
            <React.Fragment key={`grid-${i}`}>
              <Line
                x1={pad.left}
                y1={yl.y}
                x2={width - pad.right}
                y2={yl.y}
                stroke={colors.chartGrid}
                strokeWidth={1}
                opacity={isDark ? 1 : 0.55}
              />
              <SvgText
                x={pad.left - 6}
                y={yl.y + 4}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor="end">
                {yl.label}
              </SvgText>
            </React.Fragment>
          ))}
          {chart.paths.map(p => (
            <Path key={p.key} d={p.d} stroke={p.color} strokeWidth={2.25} fill="none" strokeLinecap="round" />
          ))}
          {chart.paths.map(
            p =>
              p.last && (
                <Circle key={`${p.key}-dot`} cx={p.last.x} cy={p.last.y} r={3.5} fill={p.color} />
              ),
          )}
          {chart.tickIdx.map(i => (
            <SvgText
              key={`x-${i}`}
              x={pad.left + (i / Math.max(chart.n - 1, 1)) * chart.innerW}
              y={height - 6}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="middle">
              {formatAxisDate(chart.dates[i]!)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

export const MobileLineChart = React.memo(MobileLineChartInner);

const styles = StyleSheet.create({
  wrap: {overflow: 'hidden'},
  empty: {alignItems: 'center', justifyContent: 'center'},
});
