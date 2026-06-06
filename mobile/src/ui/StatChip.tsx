import React from 'react';
import {StyleSheet, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {AppCard} from '../design-system/components/AppCard';
import {AppText} from '../design-system/components/AppText';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  label: string;
  value: string;
  icon?: string;
  accent?: boolean;
};

export function StatChip({label, value, icon, accent}: Props) {
  const {colors, iconSize, radius} = useDesignSystem();
  return (
    <AppCard variant={accent ? 'brand' : 'muted'} style={styles.chip} padding="md" animateEnter={false}>
      <View style={styles.row}>
        {icon ? (
          <View style={[styles.iconWrap, {backgroundColor: colors.accentMuted, borderRadius: radius.sm}]}>
            <Icon name={icon} size={iconSize.md} color={colors.accent} />
          </View>
        ) : null}
        <View style={styles.text}>
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
          <AppText variant="title3" numberOfLines={1}>
            {value}
          </AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  chip: {flex: 1, minWidth: 100},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, gap: 2},
});
