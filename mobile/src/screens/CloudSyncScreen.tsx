import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {ConflictCenterModal} from '../components/ConflictCenterModal';
import {SyncSettingsToggles} from '../components/SyncSettingsToggles';
import {useAuth} from '../auth/AuthContext';
import {
  useFormaSyncActions,
  useFormaSyncStatus,
} from '../hooks/useFormaSync';
import {useNativeCloudConnection} from '../hooks/useNativeCloudSync';
import {useOffline} from '../context/OfflineContext';
import {maskYandexUid} from '../mode/operatingMode';
import type {SettingsStackParamList} from '../navigation/SettingsStack';
import {AppButton, AppCard, AppScreen, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useT} from '../i18n';
import {formatUserFacingError} from '../utils/userFacingError';

function formatTs(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export default function CloudSyncScreen() {
  const t = useT();
  const {colors, space} = useDesignSystem();
  const {session} = useAuth();
  const {isOnline} = useOffline();
  const statusQuery = useFormaSyncStatus();
  const yandexConn = useNativeCloudConnection('yandex');
  const {sync, uploadOnly, downloadOnly, isBusy} = useFormaSyncActions();
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const status = statusQuery.data;
  const connected = Boolean(yandexConn.data?.connected);
  const yandexUid = session?.yandexUid ?? status?.yandexUid ?? null;

  useEffect(() => {
    setSyncError(null);
  }, [isOnline]);

  const runSync = async (fn: () => Promise<unknown>) => {
    setSyncError(null);
    try {
      await fn();
    } catch (e) {
      setSyncError(formatUserFacingError(e));
    }
  };

  return (
    <AppScreen title={t('sync.formaSyncTitle')} subtitle={t('sync.formaSyncSubtitle')} scroll>
      <AppCard padding="lg" style={{gap: space[3]}}>
        <AppText variant="title3">Яндекс аккаунт</AppText>
        <AppText variant="body" color="textSecondary">
          Статус: {connected ? 'подключён' : 'не подключён'}
        </AppText>
        {yandexUid ? (
          <AppText variant="caption" color="textMuted">
            UID: {maskYandexUid(yandexUid)}
          </AppText>
        ) : (
          <AppText variant="caption" color="warning">
            yandex_uid не найден — войдите через Яндекс (автономно)
          </AppText>
        )}
      </AppCard>

      <AppCard padding="lg" style={{marginTop: space[3], gap: space[2]}}>
        <AppText variant="title3">Ревизии</AppText>
        {statusQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <AppText variant="body" color="textSecondary">
              Локальная: {status?.localRevision ?? 0}
            </AppText>
            <AppText variant="body" color="textSecondary">
              В облаке: {status?.remoteRevision ?? '—'}
            </AppText>
            <AppText variant="body" color="textSecondary">
              Ожидают отправки: {status?.pendingChanges ?? 0}
            </AppText>
            <AppText variant="body" color="textSecondary">
              Конфликты: {status?.conflictCount ?? 0}
            </AppText>
            {status?.baselineRequired ? (
              <AppText variant="caption" color="warning">
                Требуется первичная отправка (baseline) — в облаке нет manifest
              </AppText>
            ) : null}
            {status?.debugPlan?.cloud_path ? (
              <AppText variant="caption" color="textMuted" style={{fontFamily: 'monospace'}}>
                {status.debugPlan.cloud_path}
              </AppText>
            ) : null}
            {isBusy || status?.syncInFlight ? (
              <AppText variant="caption" color="accent">
                Синхронизация выполняется…
              </AppText>
            ) : null}
          </>
        )}
      </AppCard>

      <AppCard padding="lg" style={{marginTop: space[3], gap: space[2]}}>
        <AppText variant="title3">Активность</AppText>
        <AppText variant="caption" color="textMuted">
          Последняя отправка: {formatTs(status?.lastUploadAt)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          Последняя загрузка: {formatTs(status?.lastDownloadAt)}
        </AppText>
        {status?.tokenExpired ? (
          <AppText variant="caption" color="warning">
            Токен Яндекс.Диска истёк — переподключите облако в настройках
          </AppText>
        ) : null}
        {status?.lastError ? (
          <AppText variant="caption" color="danger">
            {status.lastError}
          </AppText>
        ) : null}
        {syncError ? (
          <AppText variant="caption" color="danger">
            {syncError}
          </AppText>
        ) : null}
        {!isOnline ? (
          <AppText variant="caption" color="warning">
            Офлайн — синхронизация доступна при подключении к сети
          </AppText>
        ) : null}
      </AppCard>

      <AppCard padding="lg" style={{marginTop: space[3], gap: space[2]}}>
        <AppText variant="title3">Настройки синхронизации</AppText>
        <SyncSettingsToggles disabled={!connected} />
      </AppCard>

      <View style={[styles.actions, {marginTop: space[4], gap: space[2]}]}>
        <AppButton
          label={isBusy ? 'Синхронизация…' : 'Синхронизировать'}
          onPress={() => void runSync(() => sync())}
          loading={isBusy}
          disabled={!connected || !isOnline || isBusy}
          fullWidth
        />
        <AppButton
          label="Только отправить"
          variant="secondary"
          onPress={() => void runSync(() => uploadOnly())}
          loading={isBusy}
          disabled={!connected || !isOnline || isBusy}
          fullWidth
        />
        <AppButton
          label="Только загрузить"
          variant="secondary"
          onPress={() => void runSync(() => downloadOnly())}
          loading={isBusy}
          disabled={!connected || !isOnline || isBusy}
          fullWidth
        />
        {(status?.conflictCount ?? 0) > 0 ? (
          <AppButton
            label="Просмотр конфликтов"
            variant="secondary"
            onPress={() => setConflictsOpen(true)}
            fullWidth
          />
        ) : null}
        <AppButton
          label="Назад к настройкам"
          variant="ghost"
          onPress={() => navigation.goBack()}
          fullWidth
        />
      </View>

      <AppText variant="caption" color="textMuted" style={{marginTop: space[4]}}>
        {t('sync.formaSyncHint')}
      </AppText>

      <ConflictCenterModal visible={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {},
});
