import React from 'react';
import {StyleSheet, View} from 'react-native';

import {StatusBadge} from '../../design-system';

type Props = {
  flags: string[];
};

export function DashboardStaleWarnings({flags}: Props) {
  if (flags.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      {flags.map(flag => (
        <StatusBadge key={flag} label={flag} tone="warning" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
});
