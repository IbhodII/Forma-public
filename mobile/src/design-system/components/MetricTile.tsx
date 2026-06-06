import React, {memo} from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';

import {AppText} from './AppText';
import {useDesignSystem} from '../useDesignSystem';

type Props = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  style?: ViewStyle;
};

export const MetricTile = memo(function MetricTile({label, value, unit, hint, style}: Props) {
  const {colors, radius, space, layout} = useDesignSystem();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          borderColor: colors.border,
          padding: layout.cardPadding,
          minHeight: 72,
        },
        style,
      ]}>
      <AppText variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
      <View style={[styles.valueRow, {marginTop: space[1]}]}>
        <AppText variant="title2" numberOfLines={1}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="caption" color="textSecondary" style={{marginLeft: 4}}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={{marginTop: 2}}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
});
