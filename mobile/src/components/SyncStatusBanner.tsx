import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ConflictCenterModal} from './ConflictCenterModal';
import {useSyncStatusBanner} from '../hooks/useSyncStatusBanner';
import {useOperatingMode} from '../context/OperatingModeContext';
import {AppText} from '../design-system/components/AppText';
import {PressableScale} from '../design-system/motion/PressableScale';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {manualSyncNow, processQueue} from '../sync/syncOrchestrator';

type RootNav = NavigationProp<Record<string, object | undefined>>;

export function SyncStatusBanner() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootNav>();
  const {colors, space, layout} = useDesignSystem();
  const {mode} = useOperatingMode();
  const banner = useSyncStatusBanner();
  const [conflictsOpen, setConflictsOpen] = useState(false);

  if (banner.phase === 'idle' || mode === 'autonomous') {
    return null;
  }

  const bg =
    banner.phase === 'offline'
      ? colors.danger
      : banner.phase === 'failed'
        ? colors.danger
        : banner.phase === 'conflicts'
          ? colors.warning
          : banner.phase === 'completed'
            ? colors.accent
            : colors.accent;

  const tappable =
    banner.phase === 'offline' ||
    banner.phase === 'pending' ||
    banner.phase === 'conflicts' ||
    banner.phase === 'failed';

  const onPress = () => {
    if (banner.phase === 'offline') {
      navigation.navigate('Settings' as never, {
        screen: 'SyncHub',
      } as never);
      return;
    }
    if (banner.phase === 'conflicts') {
      setConflictsOpen(true);
      return;
    }
    if (banner.phase === 'pending') {
      void processQueue({manual: true});
      return;
    }
    if (banner.phase === 'failed') {
      void manualSyncNow();
    }
  };

  const content = (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top > 0 ? insets.top : space[2],
          paddingHorizontal: layout.screenPaddingX,
          backgroundColor: bg,
        },
      ]}>
      <AppText variant="caption" style={{color: colors.accentText, flex: 1}}>
        {banner.message}
      </AppText>
      {banner.phase === 'syncing' ? (
        <ActivityIndicator color={colors.accentText} size="small" />
      ) : tappable ? (
        <AppText variant="caption" style={{color: colors.accentText, fontWeight: '700'}}>
          {banner.phase === 'offline'
            ? 'Настр.'
            : banner.phase === 'conflicts'
              ? 'Открыть'
              : 'Повтор'}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <>
      {tappable ? (
        <PressableScale onPress={onPress} scaleTo={0.98}>
          {content}
        </PressableScale>
      ) : (
        content
      )}
      <ConflictCenterModal visible={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    minHeight: 44,
  },
});
