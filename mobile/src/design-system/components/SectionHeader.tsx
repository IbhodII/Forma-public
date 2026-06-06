import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText} from './AppText';
import {PressableScale} from '../motion/PressableScale';
import {useDesignSystem} from '../useDesignSystem';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({title, actionLabel, onAction}: Props) {
  const {layout} = useDesignSystem();
  return (
    <View style={[styles.row, {minHeight: layout.listItemMinHeight}]}>
      <AppText variant="title3">{title}</AppText>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} scaleTo={0.95}>
          <AppText variant="caption" color="accent">
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
