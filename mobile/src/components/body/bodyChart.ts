import {useMemo} from 'react';
import {useWindowDimensions} from 'react-native';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {formatBodyMetricSigned, formatBodyMetricValue} from '../../utils/bodyMetrics';

export const BODY_CHART_HEIGHT = 200;
export const BODY_CHART_HEIGHT_EXPANDED = 228;
export const BODY_BAR_CHART_HEIGHT = 220;

export function useBodyChartWidth(extraInnerPadding = 0): number {
  const {width} = useWindowDimensions();
  const {layout} = useDesignSystem();
  return useMemo(
    () =>
      Math.max(
        200,
        width - layout.screenPaddingX * 2 - layout.cardPadding * 2 - extraInnerPadding,
      ),
    [width, layout.screenPaddingX, layout.cardPadding, extraInnerPadding],
  );
}

export type BodyChartPoint = {date: string; value: number};

export function buildWeightLinePoints(
  rows: Array<{date: string; weight_kg?: number | null}>,
  limit = 12,
): BodyChartPoint[] {
  return rows
    .slice()
    .reverse()
    .filter(r => r.weight_kg != null)
    .slice(-limit)
    .map(r => ({date: r.date, value: Number(r.weight_kg)}));
}

export function weightTrendSummary(points: BodyChartPoint[]): string | undefined {
  if (points.length === 0) {
    return undefined;
  }
  const last = points[points.length - 1]!;
  const first = points[0]!;
  if (points.length === 1) {
    return `Последнее: ${formatBodyMetricValue(last.value, ' кг')}`;
  }
  const delta = last.value - first.value;
  return `Последнее ${formatBodyMetricValue(last.value, ' кг')} · ${formatBodyMetricSigned(delta)} за период`;
}
