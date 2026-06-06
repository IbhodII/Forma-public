import {useCallback, useEffect, useState} from 'react';
import {Platform} from 'react-native';
import {useQuery, useQueryClient} from '@tanstack/react-query';

import type {CloudProvider} from '../config/cloudOAuth';
import {isNativeCloudConfigured} from '../config/cloudOAuth';
import {CloudSyncService} from '../services/CloudSyncService';
import {authorizeCloudProvider, getCloudRedirectUris} from '../services/cloudOAuth';

export function useNativeCloudEnabled(provider: CloudProvider): boolean {
  return Platform.OS === 'android' && isNativeCloudConfigured(provider);
}

export function useNativeCloudConnection(provider: CloudProvider) {
  const enabled = useNativeCloudEnabled(provider);
  return useQuery({
    queryKey: ['native-cloud-status', provider],
    queryFn: () => CloudSyncService.getConnectionInfo(provider),
    enabled,
    refetchInterval: 15000,
  });
}

export function useNativeCloudBackups(provider: CloudProvider, connected: boolean) {
  const enabled = useNativeCloudEnabled(provider) && connected;
  return useQuery({
    queryKey: ['native-cloud-backups', provider],
    queryFn: () => CloudSyncService.listBackups(provider),
    enabled,
  });
}

export function useNativeCloudActions(provider: CloudProvider) {
  const qc = useQueryClient();

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({queryKey: ['native-cloud-status', provider]});
    await qc.invalidateQueries({queryKey: ['native-cloud-backups', provider]});
  }, [provider, qc]);

  const connect = useCallback(async () => {
    await authorizeCloudProvider(provider);
    await invalidate();
  }, [provider, invalidate]);

  const disconnect = useCallback(async () => {
    await CloudSyncService.deleteToken(provider);
    await invalidate();
  }, [provider, invalidate]);

  const backup = useCallback(async () => {
    const name = await CloudSyncService.backupToCloud(provider);
    await invalidate();
    return name;
  }, [provider, invalidate]);

  const restore = useCallback(
    async (filename?: string) => {
      const name = await CloudSyncService.restoreFromCloud(provider, filename);
      await invalidate();
      return name;
    },
    [provider, invalidate],
  );

  return {connect, disconnect, backup, restore, invalidate};
}

/** Показать redirect URI для регистрации в консолях OAuth (отладка). */
export function useCloudRedirectUris() {
  const [uris, setUris] = useState<{yandex: string; google: string} | null>(null);
  useEffect(() => {
    if (Platform.OS === 'android') {
      setUris(getCloudRedirectUris());
    }
  }, []);
  return uris;
}
