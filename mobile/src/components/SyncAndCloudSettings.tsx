import React, {useEffect, useState} from 'react';
import {Alert, Linking, Platform, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  fetchAutoBackupStatus,
  fetchCloudBackupList,
  fetchRemoteBackupStatus,
  restoreCloudBackup,
  setAutoBackupEnabled,
  type CloudProvider,
} from '../api/cloud';
import {
  backupDatabase,
  disconnectPolar,
  fetchGoogleStatus,
  fetchIntegrationSettings,
  fetchPolarStatus,
  fetchYandexStatus,
  getCloudAuthUrl,
  getPolarAuthUrl,
  revokeGoogle,
  revokeYandex,
  runFitImport,
  saveIntegrationSettings,
  syncCloudDownload,
} from '../api/user';
import {isNativeCloudConfigured} from '../config/cloudOAuth';
import {cloudOAuthUserMessage} from '../services/cloudOAuthErrors';
import {useOffline} from '../context/OfflineContext';
import {useOperatingMode} from '../context/OperatingModeContext';
import {
  useCloudRedirectUris,
  useNativeCloudActions,
  useNativeCloudBackups,
  useNativeCloudConnection,
  useNativeCloudEnabled,
} from '../hooks/useNativeCloudSync';
import {AppButton, AppChip, AppInput, AppText, SettingsPanel} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

const MOBILE_HIDE_DESKTOP_ONLY = true;
function BackupRow({
  filename,
  onRestore,
  disabled,
}: {
  filename: string;
  onRestore: () => void;
  disabled?: boolean;
}) {
  const {colors, layout} = useDesignSystem();
  return (
    <View
      style={[
        styles.backupRow,
        {borderBottomColor: colors.border, minHeight: layout.listItemMinHeight},
      ]}>
      <AppText variant="caption" style={styles.backupName}>
        {filename}
      </AppText>
      <AppButton label="Восстановить" variant="secondary" size="sm" disabled={disabled} onPress={onRestore} />
    </View>
  );
}

function NativeCloudBlock({provider}: {provider: CloudProvider}) {
  const label = provider === 'yandex' ? 'Яндекс.Диск' : 'Google Drive';
  const enabled = useNativeCloudEnabled(provider);
  const statusQuery = useNativeCloudConnection(provider);
  const connected = Boolean(statusQuery.data?.connected);
  const backupsQuery = useNativeCloudBackups(provider, connected);
  const {connect, disconnect, backup, restore} = useNativeCloudActions(provider);
  const redirectUris = useCloudRedirectUris();

  const connectMut = useMutation({
    mutationFn: connect,
    onSuccess: () => Alert.alert(label, 'Подключено'),
    onError: (e: unknown) => {
      console.warn(`[cloud-oauth] ${provider} connect failed`, e);
      Alert.alert('Ошибка OAuth', cloudOAuthUserMessage(e));
    },
  });
  const disconnectMut = useMutation({
    mutationFn: disconnect,
    onSuccess: () => Alert.alert(label, 'Отключено'),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });
  const backupMut = useMutation({
    mutationFn: backup,
    onSuccess: name => Alert.alert('Бэкап', `Загружено: ${name}`),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });
  const restoreMut = useMutation({
    mutationFn: (filename?: string) => restore(filename),
    onSuccess: name =>
      Alert.alert(
        'Восстановление',
        `База заменена файлом ${name}. Перезапустите приложение, если данные не обновились.`,
      ),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  if (!enabled) {
    return (
      <View style={styles.section}>
        <AppText variant="title3">{label} (на устройстве)</AppText>
        <AppText variant="caption" color="warning">
          Задайте EXPO_PUBLIC_{provider === 'yandex' ? 'YANDEX' : 'GOOGLE'}_CLIENT_ID в mobile/.env
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <AppText variant="title3">{label} (на устройстве)</AppText>
      <AppText variant="body" color="textSecondary">
        Статус: {connected ? 'подключён' : 'не подключён'}
        {statusQuery.data?.expiresAt ? ` · до ${statusQuery.data.expiresAt.slice(0, 10)}` : ''}
      </AppText>
      {redirectUris ? (
        <AppText variant="caption" color="warning" selectable>
          Redirect: {provider === 'yandex' ? redirectUris.yandex : redirectUris.google}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <AppButton
          label={connectMut.isPending ? '…' : 'Подключить'}
          variant="secondary"
          size="sm"
          onPress={() => connectMut.mutate()}
          disabled={connectMut.isPending}
        />
        <AppButton
          label="Отключить"
          variant="secondary"
          size="sm"
          onPress={() => disconnectMut.mutate()}
          disabled={disconnectMut.isPending}
        />
        <AppButton
          label={backupMut.isPending ? 'Бэкап…' : 'Бэкап БД'}
          variant="secondary"
          size="sm"
          disabled={!connected || backupMut.isPending}
          onPress={() => backupMut.mutate()}
        />
      </View>
      {(backupsQuery.data || []).slice(0, 6).map((b: {filename: string}) => (
        <BackupRow
          key={b.filename}
          filename={b.filename}
          disabled={!connected || restoreMut.isPending}
          onRestore={() => restoreMut.mutate(b.filename)}
        />
      ))}
      <AppButton
        label="Восстановить последний бэкап"
        size="sm"
        disabled={!connected || restoreMut.isPending}
        onPress={() => restoreMut.mutate(undefined)}
      />
    </View>
  );
}

export function SyncAndCloudSettings() {
  const {isOnline} = useOffline();
  const {isLegacyApi} = useOperatingMode();
  const queryClient = useQueryClient();
  const [fitPath, setFitPath] = useState('');
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>('yandex');

  const useNativeYandex = useNativeCloudEnabled('yandex');
  const useNativeGoogle = useNativeCloudEnabled('google');
  const useServerCloud = isLegacyApi && !useNativeYandex && !useNativeGoogle;

  const integrationQuery = useQuery({
    queryKey: ['integration-settings'],
    queryFn: fetchIntegrationSettings,
  });
  const polarQuery = useQuery({
    queryKey: ['polar-status'],
    queryFn: fetchPolarStatus,
    refetchInterval: 30000,
  });
  const yandexQuery = useQuery({
    queryKey: ['cloud-yandex-status'],
    queryFn: fetchYandexStatus,
    refetchInterval: 30000,
    enabled: useServerCloud && isOnline,
  });
  const googleQuery = useQuery({
    queryKey: ['cloud-google-status'],
    queryFn: fetchGoogleStatus,
    refetchInterval: 30000,
    enabled: useServerCloud && isOnline,
  });
  const autoBackupQuery = useQuery({
    queryKey: ['cloud-auto-backup'],
    queryFn: fetchAutoBackupStatus,
    enabled: useServerCloud && isOnline,
  });
  const backupListQuery = useQuery({
    queryKey: ['cloud-backup-list', cloudProvider],
    queryFn: () => fetchCloudBackupList(cloudProvider),
    enabled: useServerCloud && isOnline,
  });
  const remoteStatusQuery = useQuery({
    queryKey: ['cloud-remote-status', cloudProvider],
    queryFn: () => fetchRemoteBackupStatus(cloudProvider),
    enabled: useServerCloud && isOnline,
  });

  useEffect(() => {
    setFitPath(integrationQuery.data?.fit_folder_path || '');
  }, [integrationQuery.data?.fit_folder_path]);

  const saveFitMutation = useMutation({
    mutationFn: () => saveIntegrationSettings({fit_folder_path: fitPath}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['integration-settings']});
    },
  });
  const fitImportMutation = useMutation({mutationFn: runFitImport});
  const disconnectPolarMutation = useMutation({
    mutationFn: disconnectPolar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['polar-status']});
    },
  });
  const autoBackupMut = useMutation({
    mutationFn: (enable: boolean) => setAutoBackupEnabled(enable),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['cloud-auto-backup']});
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });
  const restoreMut = useMutation({
    mutationFn: (filename?: string) => restoreCloudBackup(cloudProvider, filename),
    onSuccess: data => Alert.alert('Восстановление', data.message),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const openPolarAuth = async () => {
    const url = await getPolarAuthUrl();
    await Linking.openURL(url);
  };
  const openCloudAuth = async (provider: CloudProvider) => {
    const url = await getCloudAuthUrl(provider);
    await Linking.openURL(url);
  };

  const renderServerCloudBlock = (provider: CloudProvider, connected: boolean) => (
    <View key={`server-${provider}`} style={styles.section}>
      <AppText variant="title3">
        {provider === 'yandex' ? 'Яндекс.Диск' : 'Google Drive'} (сервер)
      </AppText>
      <AppText variant="body" color="textSecondary">
        Статус: {connected ? 'подключён' : 'не подключён'}
      </AppText>
      <View style={styles.row}>
        <AppButton label="Подключить" variant="secondary" size="sm" onPress={() => void openCloudAuth(provider)} />
        <AppButton
          label="Отключить"
          variant="secondary"
          size="sm"
          onPress={() => void (provider === 'yandex' ? revokeYandex() : revokeGoogle())}
        />
        <AppButton
          label="Бэкап БД"
          variant="secondary"
          size="sm"
          onPress={() => void backupDatabase(provider)}
        />
        <AppButton
          label="Синхр. трен."
          variant="secondary"
          size="sm"
          onPress={() => void syncCloudDownload(provider)}
        />
      </View>
    </View>
  );

  return (
    <SettingsPanel title="Синхронизация и облако">
      <AppText variant="body" color="textSecondary">
        Статус FormaSync и переключатели — в разделе «Синхронизация». Здесь — мобильные облачные функции.
      </AppText>

      {Platform.OS === 'android' ? (
        <AppText variant="caption" color="warning">
          Облако на устройстве:{' '}
          {isNativeCloudConfigured('yandex') || isNativeCloudConfigured('google')
            ? 'OAuth и бэкап SQLite локально (токены в Keychain).'
            : 'укажите Client ID в .env — см. CLOUD_SYNC_ANDROID.md'}
        </AppText>
      ) : null}

      {!MOBILE_HIDE_DESKTOP_ONLY ? (
        <>
          <View style={styles.section}>
            <AppText variant="title3">FIT-папка</AppText>
            <AppInput
              value={fitPath}
              onChangeText={setFitPath}
              placeholder="Путь к FIT-папке"
            />
            <View style={styles.row}>
              <AppButton
                label={saveFitMutation.isPending ? 'Сохранение…' : 'Сохранить путь'}
                variant="secondary"
                size="sm"
                onPress={() => saveFitMutation.mutate()}
                loading={saveFitMutation.isPending}
              />
              <AppButton
                label={fitImportMutation.isPending ? 'Импорт…' : 'Импорт FIT'}
                size="sm"
                onPress={() => fitImportMutation.mutate()}
                loading={fitImportMutation.isPending}
              />
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="title3">Polar Flow</AppText>
            <AppText variant="caption" color="warning">
              Токены Polar хранятся на сервере — отдельно от облачного бэкапа.
            </AppText>
            <AppText variant="body" color="textSecondary">
              Статус: {polarQuery.data?.connected ? 'подключён' : 'не подключён'}
            </AppText>
            <View style={styles.row}>
              <AppButton label="Подключить Polar" variant="secondary" size="sm" onPress={() => void openPolarAuth()} />
              <AppButton
                label="Отключить"
                variant="secondary"
                size="sm"
                onPress={() => disconnectPolarMutation.mutate()}
              />
            </View>
          </View>
        </>
      ) : null}

      {Platform.OS === 'android' ? (
        <>
          <AppText variant="caption" color="textMuted" style={{marginBottom: 4}}>
            Аварийный бэкап SQLite (.db) — отдельно от FormaSync
          </AppText>
          <NativeCloudBlock provider="yandex" />
          <NativeCloudBlock provider="google" />
        </>
      ) : null}

      {useServerCloud && !MOBILE_HIDE_DESKTOP_ONLY ? (
        <>
          {renderServerCloudBlock('yandex', Boolean(yandexQuery.data?.connected))}
          {renderServerCloudBlock('google', Boolean(googleQuery.data?.connected))}

          <View style={styles.section}>
            <AppText variant="title3">Облачные бэкапы (сервер)</AppText>
            {!isOnline ? (
              <AppText variant="caption" color="warning">
                Список и восстановление бэкапов — только онлайн
              </AppText>
            ) : null}
            <View style={styles.row}>
              <AppChip
                label="Яндекс"
                variant="pill"
                active={cloudProvider === 'yandex'}
                onPress={() => setCloudProvider('yandex')}
              />
              <AppChip
                label="Google"
                variant="pill"
                active={cloudProvider === 'google'}
                onPress={() => setCloudProvider('google')}
              />
            </View>
            <AppText variant="caption" color="textMuted">
              Авто-бэкап: {autoBackupQuery.data?.enabled ? 'включён' : 'выключен'}
            </AppText>
            <View style={styles.row}>
              <AppButton
                label="Включить авто-бэкап"
                variant="secondary"
                size="sm"
                disabled={!isOnline}
                onPress={() => autoBackupMut.mutate(true)}
              />
              <AppButton
                label="Выключить"
                variant="secondary"
                size="sm"
                disabled={!isOnline}
                onPress={() => autoBackupMut.mutate(false)}
              />
            </View>
            {remoteStatusQuery.data?.found ? (
              <AppText variant="caption" color="textMuted">
                В облаке найдено бэкапов: {remoteStatusQuery.data.count ?? 0}
                {remoteStatusQuery.data.latest?.filename
                  ? ` · последний: ${remoteStatusQuery.data.latest.filename}`
                  : ''}
              </AppText>
            ) : (
              <AppText variant="caption" color="textMuted">
                Удалённые бэкапы не найдены
              </AppText>
            )}
            {(backupListQuery.data?.backups || []).slice(0, 8).map((b: {filename: string}) => (
              <BackupRow
                key={b.filename}
                filename={b.filename}
                disabled={!isOnline}
                onRestore={() => restoreMut.mutate(b.filename)}
              />
            ))}
            <AppButton
              label="Восстановить последний бэкап"
              size="sm"
              disabled={!isOnline}
              onPress={() => restoreMut.mutate(undefined)}
            />
          </View>
        </>
      ) : null}
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  section: {gap: 8},
  row: {flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'},
  backupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  backupName: {flex: 1},
});
