import React, {memo, type ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';

import {useDesignSystem} from '../useDesignSystem';

type Props = {
  children: ReactNode;
  columns?: 2;
};

export const MetricGrid = memo(function MetricGrid({children, columns = 2}: Props) {
  const {space} = useDesignSystem();
  return (
    <View style={[styles.grid, {gap: space[2]}]}>
      {React.Children.map(children, child => (
        <View style={[styles.cell, {width: `${100 / columns}%` as unknown as number}]}>{child}</View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexGrow: 1,
    flexBasis: '48%',
    maxWidth: '50%',
  },
});
