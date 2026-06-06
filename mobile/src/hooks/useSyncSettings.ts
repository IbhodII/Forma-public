import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {refreshFormaSyncBackgroundSchedule} from '../sync/formaSyncScheduler';
import {
  getSyncSettings,
  saveSyncSettings,
  type SyncSettings,
} from '../sync/syncSettings';

const SETTINGS_KEY = ['sync-settings'];

export function useSyncSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSyncSettings,
  });

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<SyncSettings>) => saveSyncSettings(patch),
    onSuccess: async () => {
      await refreshFormaSyncBackgroundSchedule();
      await queryClient.invalidateQueries({queryKey: SETTINGS_KEY});
      await queryClient.invalidateQueries({queryKey: ['forma-sync-auto-enabled']});
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    saveSettings: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    refetch: query.refetch,
  };
}
