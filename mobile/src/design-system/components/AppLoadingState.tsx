import React from 'react';
import {ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import {AppText} from './AppText';
import {useDesignSystem} from '../useDesignSystem';

type Props = {
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppLoadingState({label, compact, style}: Props) {
  const {colors, layout, space} = useDesignSystem();

  return (
    <View
      style={[
        styles.wrap,
        compact ? styles.compact : {minHeight: layout.emptyMinHeight},
        style,
      ]}>
      <ActivityIndicator size={compact ? 'small' : 'large'} color={colors.accent} />
      {label ? (
        <AppText variant="caption" color="textMuted" style={{marginTop: space[2]}}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', justifyContent: 'center', paddingVertical: 16},
  compact: {paddingVertical: 12, minHeight: 64},
});
