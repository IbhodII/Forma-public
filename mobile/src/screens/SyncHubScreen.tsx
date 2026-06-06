import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {ConflictCenterModal} from '../components/ConflictCenterModal';
import {SyncSettingsToggles} from '../components/SyncSettingsToggles';
import {useOffline} from '../context/OfflineContext';
import {useDeveloperMode} from '../hooks/useDeveloperMode';
import {useFormaSyncActions, useFormaSyncStatus} from '../hooks/useFormaSync';
import {useNativeCloudConnection} from '../hooks/useNativeCloudSync';
import {useSyncStatusBanner} from '../hooks/useSyncStatusBanner';
import type {SettingsStackParamList} from '../navigation/SettingsStack';
import {manualSyncNow} from '../sync/syncOrchestrator';
import {
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  CollapsibleSection,
  StatusBadge,
} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SyncHub'>;

function statusLabel(phase: string, pending: number): string {
  switch (phase) {
    case 'offline':
      return 'Офлайн — изменения на устройстве';
    case 'pending':
      return `Ожидает синхронизации (${pending})`;
    case 'syncing':
      return 'Синхронизация…';
    case 'completed':
      return 'Синхронизировано';
    case 'conflicts':
      return 'Есть конфликты';
    case 'failed':
      return 'Синхронизация не удалась';
    default:
      return pending > 0 ? `Ожидает (${pending})` : 'Всё синхронизировано';
  }
}

export default function SyncHubScreen() {
  const {space} = useDesignSystem();
  const navigation = useNavigation<Nav>();
  const {isOnline} = useOffline();
  const banner = useSyncStatusBanner();
  const statusQuery = useFormaSyncStatus();
  const yandexConn = useNativeCloudConnection('yandex');
  const {isBusy} = useFormaSyncActions();
  const {developerMode} = useDeveloperMode();
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const status = statusQuery.data;
  const connected = Boolean(yandexConn.data?.connected);
  const pending = banner.pendingCount;

  useEffect(() => {
    setSyncError(null);
  }, [isOnline]);

  const runSync = async () => {
    setSyncError(null);
    const result = await manualSyncNow();
    if (!result.ok) {
      setSyncError(result.message ?? 'Синхронизация не удалась');
    }
  };

  return (
    <AppScreen title="Синхронизация" subtitle="Облако и локальные изменения" scroll>
      <AppCard padding="lg" style={{gap: space[3], alignItems: 'center'}}>
        {statusQuery.isLoading ? (
          <ActivityIndicator />
        ) : (
          <>
            <AppText variant="title2" style={{textAlign: 'center'}}>
              {statusLabel(banner.phase, pending)}
            </AppText>
            <View style={styles.badges}>
              {!isOnline ? <StatusBadge label="Офлайн" tone="warning" /> : null}
              {pending > 0 ? <StatusBadge label={`${pending} в очереди`} tone="accent" /> : null}
              {(status?.conflictCount ?? 0) > 0 ? (
                <StatusBadge label="Конфликты" tone="warning" />
              ) : null}
            </View>
            {status?.tokenExpired ? (
              <AppText variant="caption" color="warning" style={{textAlign: 'center'}}>
                Токен Яндекс.Диска истёк — переподключите облако в настройках
              </AppText>
            ) : null}
            {syncError ? (
              <AppText variant="caption" color="danger" style={{textAlign: 'center'}}>
                {syncError}
              </AppText>
            ) : null}
          </>
        )}
      </AppCard>

      <View style={{marginTop: space[3], gap: space[2]}}>
        <AppButton
          label={isBusy ? 'Синхронизация…' : 'Синхронизировать сейчас'}
          onPress={() => void runSync()}
          loading={isBusy}
          disabled={!isOnline}
          fullWidth
        />
        {(status?.conflictCount ?? 0) > 0 ? (
          <AppButton
            label="Разрешить конфликты"
            variant="secondary"
            onPress={() => setConflictsOpen(true)}
            fullWidth
          />
        ) : null}
        <AppText variant="caption" color="textMuted" style={{textAlign: 'center'}}>
          Яндекс.Диск: {connected ? 'подключён' : 'не подключён'}
        </AppText>
      </View>

      <AppCard padding="lg" style={{marginTop: space[4], gap: space[2]}}>
        <AppText variant="title3">Настройки</AppText>
        <SyncSettingsToggles disabled={!connected} />
      </AppCard>

      {developerMode ? (
        <View style={{marginTop: space[3]}}>
          <CollapsibleSection
            title="Подробности FormaSync"
            subtitle="Ревизии, только загрузка или выгрузка">
            <AppButton
              label="Открыть расширенный экран"
              variant="secondary"
              onPress={() => navigation.navigate('CloudSyncAdvanced')}
              fullWidth
            />
          </CollapsibleSection>
        </View>
      ) : null}

      <ConflictCenterModal visible={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
});
