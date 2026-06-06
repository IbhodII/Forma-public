export type EntitySyncLabel =
  | 'local_only'
  | 'pending_sync'
  | 'synced'
  | 'conflict'
  | 'failed_sync';

export type EntitySyncRow = {
  sync_status?: string | null;
  last_synced_revision?: number | null;
  last_sync_attempt_at?: string | null;
};

export function getEntitySyncLabel(
  row: EntitySyncRow,
  queueMeta?: {hasFailedJob?: boolean; hasPendingJob?: boolean},
): EntitySyncLabel {
  const status = row.sync_status ?? 'pending';
  if (status === 'conflict') {
    return 'conflict';
  }
  if (status === 'synced') {
    return 'synced';
  }
  if (
    status === 'pending' &&
    row.last_sync_attempt_at &&
    (queueMeta?.hasFailedJob || queueMeta?.hasPendingJob)
  ) {
    return 'failed_sync';
  }
  if (status === 'pending' && row.last_synced_revision == null && !row.last_sync_attempt_at) {
    return 'local_only';
  }
  if (status === 'pending') {
    return 'pending_sync';
  }
  return 'pending_sync';
}

export const SYNC_LABEL_RU: Record<EntitySyncLabel, string> = {
  local_only: 'Только на устройстве',
  pending_sync: 'Ожидает синхронизации',
  synced: 'Синхронизировано',
  conflict: 'Конфликт',
  failed_sync: 'Ошибка синхронизации',
};
