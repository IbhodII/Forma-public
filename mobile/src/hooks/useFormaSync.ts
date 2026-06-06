import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {FormaSyncEngine} from '../sync/FormaSyncEngine';
import {
  isFormaSyncAutoEnabled,
  setFormaSyncAutoEnabled,
} from '../sync/formaSyncSettings';
import {refreshFormaSyncBackgroundSchedule} from '../sync/formaSyncScheduler';
import {manualSyncNow} from '../sync/syncOrchestrator';
import {isOnline} from '../services/network';

const STATUS_KEY = ['forma-sync-status'];

export function useFormaSyncStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => FormaSyncEngine.getStatus(),
    refetchInterval: 30_000,
  });
}

export function useFormaSyncAutoEnabled() {
  return useQuery({
    queryKey: ['forma-sync-auto-enabled'],
    queryFn: () => isFormaSyncAutoEnabled(),
  });
}

export function useFormaSyncActions() {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({queryKey: STATUS_KEY});
    await queryClient.invalidateQueries({queryKey: ['sync-conflicts']});
  };

  const syncMutation = useMutation({
    mutationFn: async (opts?: {forceUpload?: boolean}) => {
      if (!(await isOnline())) {
        throw new Error('Нет сети — синхронизация недоступна');
      }
      if (opts?.forceUpload) {
        return FormaSyncEngine.uploadOnly({force: true});
      }
      const result = await manualSyncNow();
      if (!result.ok) {
        throw new Error(result.message ?? 'Синхронизация не удалась');
      }
      return {uploaded: false, downloaded: false, message: result.message ?? 'Синхронизация выполнена'};
    },
    onSuccess: invalidate,
  });

  const uploadMutation = useMutation({
    mutationFn: async (opts?: {force?: boolean}) => {
      if (!(await isOnline())) {
        throw new Error('Нет сети — отправка недоступна');
      }
      return FormaSyncEngine.uploadOnly(opts);
    },
    onSuccess: invalidate,
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (!(await isOnline())) {
        throw new Error('Нет сети — загрузка недоступна');
      }
      return FormaSyncEngine.downloadOnly();
    },
    onSuccess: invalidate,
  });

  const setAutoSync = async (enabled: boolean) => {
    await setFormaSyncAutoEnabled(enabled);
    await refreshFormaSyncBackgroundSchedule();
    await queryClient.invalidateQueries({queryKey: ['forma-sync-auto-enabled']});
  };

  const isBusy =
    syncMutation.isPending || uploadMutation.isPending || downloadMutation.isPending;

  return {
    sync: syncMutation.mutateAsync,
    uploadOnly: uploadMutation.mutateAsync,
    downloadOnly: downloadMutation.mutateAsync,
    syncMutation,
    uploadMutation,
    downloadMutation,
    setAutoSync,
    isBusy,
  };
}

export {useSyncSettings} from './useSyncSettings';
