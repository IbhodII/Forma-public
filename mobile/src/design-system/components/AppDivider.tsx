import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

import {useDesignSystem} from '../useDesignSystem';

type Props = {
  style?: StyleProp<ViewStyle>;
  inset?: boolean;
};

/** Premium fade divider — center accent, soft edges */
export function AppDivider({style, inset}: Props) {
  const {colors, layout, space} = useDesignSystem();

  return (
    <View
      style={[
        styles.wrap,
        inset && {marginHorizontal: layout.screenPaddingX},
        {marginVertical: space[2]},
        style,
      ]}>
      <Svg height={1} width="100%">
        <Defs>
          <LinearGradient id="formaDivider" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.border} stopOpacity="0" />
            <Stop offset="0.35" stopColor={colors.border} stopOpacity="0.6" />
            <Stop offset="0.5" stopColor={colors.accent} stopOpacity="0.35" />
            <Stop offset="0.65" stopColor={colors.border} stopOpacity="0.6" />
            <Stop offset="1" stopColor={colors.border} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="1" fill="url(#formaDivider)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {width: '100%', overflow: 'hidden'},
});
