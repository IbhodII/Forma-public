import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Section header for tab panels inside padded AppScreen (no extra horizontal inset). */
export function BodySectionHeader({title, actionLabel, onAction}: Props) {
  const {colors, typography, layout} = useDesignSystem();

  return (
    <View style={styles.head}>
      <Text style={[typography.overline, {color: colors.textSecondary}]}>{title}</Text>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} scaleTo={0.96} spring="snappy" hitSlop={layout.iconHitSlop}>
          <Text style={[typography.caption, {color: colors.accent, fontWeight: '700'}]}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
});
