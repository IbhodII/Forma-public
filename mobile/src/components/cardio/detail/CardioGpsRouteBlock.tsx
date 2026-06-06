import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Polyline} from 'react-native-svg';

import {AppEmptyState, AppErrorState, AppLoadingState, AppText} from '../../../design-system';
import {useDesignSystem} from '../../../design-system/useDesignSystem';
import {normalizeTrackForSvg, parseTrackGeojson, type TrackPoint} from '../../../utils/bikeTrack';

type Props = {
  geo: Record<string, unknown> | undefined;
  pointsOverride?: TrackPoint[];
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
};

export function CardioGpsRouteBlock({geo, pointsOverride, loading, error, onRetry}: Props) {
  const {colors} = useDesignSystem();
  const track = useMemo(() => {
    if (pointsOverride?.length) {
      return {points: pointsOverride};
    }
    if (geo) {
      return parseTrackGeojson(geo);
    }
    return null;
  }, [geo, pointsOverride]);

  const svg = useMemo(
    () => (track?.points ? normalizeTrackForSvg(track.points) : null),
    [track],
  );

  if (loading) {
    return <AppLoadingState label="Загрузка маршрута…" compact />;
  }
  if (error) {
    return (
      <AppErrorState message="Маршрут недоступен — нет сети" onRetry={onRetry} compact />
    );
  }
  if (!svg) {
    return <AppEmptyState title="GPS нет" compact />;
  }

  const w = 320;
  const h = 160;
  const poly = svg.xs
    .map((x, i) => `${x * w},${svg.ys[i]! * h}`)
    .join(' ');

  return (
    <View style={styles.root}>
      <AppText variant="title3">Маршрут</AppText>
      <View style={[styles.mapBox, {backgroundColor: colors.surfaceMuted}]}>
        <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
          <Polyline
            points={poly}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 8},
  mapBox: {
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 160,
  },
});
