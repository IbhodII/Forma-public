import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

import {useDesignSystem} from '../useDesignSystem';

type Props = {
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'hero' | 'soft';
};

export function BrandGradient({style, variant = 'primary'}: Props) {
  const {colors, radius} = useDesignSystem();

  const stops =
    variant === 'hero'
      ? [
          {offset: '0', color: colors.heroStart},
          {offset: '0.45', color: colors.heroMid},
          {offset: '1', color: colors.heroEnd},
        ]
      : variant === 'soft'
        ? [
            {offset: '0', color: colors.accentMuted},
            {offset: '1', color: colors.surfaceMuted},
          ]
        : [
            {offset: '0', color: colors.stateTraining},
            {offset: '0.55', color: colors.accent},
            {offset: '1', color: colors.stateRecovery},
          ];

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="formaGrad" x1="0" y1="0" x2="1" y2="1">
            {stops.map(s => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={radius.md} fill="url(#formaGrad)" />
      </Svg>
    </View>
  );
}
