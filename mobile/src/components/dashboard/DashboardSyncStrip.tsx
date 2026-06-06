import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';

import {useOperatingMode} from '../../context/OperatingModeContext';
import {useSyncStatusBanner} from '../../hooks/useSyncStatusBanner';
import {AppText, StatusBadge} from '../../design-system';
import {PressableScale} from '../../design-system/motion/PressableScale';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type TabNav = BottomTabNavigationProp<Record<string, undefined>>;

export function DashboardSyncStrip() {
  const navigation = useNavigation<TabNav>();
  const {mode} = useOperatingMode();
  const banner = useSyncStatusBanner();
  const {colors, space, radius, layout} = useDesignSystem();

  if (mode === 'autonomous' || (banner.phase === 'idle' && banner.pendingCount === 0)) {
    return null;
  }

  return (
    <PressableScale
      onPress={() =>
        navigation.navigate('Settings' as never, {
          screen: 'SyncHub',
        } as never)
      }
      scaleTo={0.98}
      style={[
        styles.root,
        {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          borderColor: colors.border,
          padding: layout.cardPadding,
          marginBottom: space[2],
        },
      ]}>
      <View style={styles.row}>
        <AppText variant="caption" color="textSecondary" style={{flex: 1}}>
          {banner.message || 'Синхронизация'}
        </AppText>
        {banner.pendingCount > 0 ? (
          <StatusBadge label={`${banner.pendingCount}`} tone="accent" />
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
