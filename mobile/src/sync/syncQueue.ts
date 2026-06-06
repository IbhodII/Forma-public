import {executeSql, initDB, nowIso} from '../database/index';

export type SyncQueueKind = 'legacy_full' | 'forma_sync';
export type SyncQueueStatus = 'pending' | 'running' | 'failed' | 'done';

export type SyncQueueRow = {
  id: number;
  kind: SyncQueueKind;
  status: SyncQueueStatus;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export const MAX_SYNC_ATTEMPTS = 8;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 30 * 60_000;

export function computeNextRetryAt(attemptCount: number, fromMs = Date.now()): string {
  const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attemptCount - 1));
  return new Date(fromMs + delay).toISOString();
}

function rowFromDb(item: Record<string, unknown>): SyncQueueRow {
  return {
    id: Number(item.id),
    kind: item.kind as SyncQueueKind,
    status: item.status as SyncQueueStatus,
    attempt_count: Number(item.attempt_count ?? 0),
    next_retry_at: (item.next_retry_at as string | null) ?? null,
    last_error: (item.last_error as string | null) ?? null,
    created_at: String(item.created_at),
    updated_at: String(item.updated_at),
  };
}

export async function enqueueSyncJob(kind: SyncQueueKind): Promise<void> {
  await initDB();
  const existing = await executeSql(
    `SELECT id FROM sync_queue
     WHERE kind = ? AND status IN ('pending', 'running')`,
    [kind],
  );
  if (existing.rows.length > 0) {
    return;
  }
  const ts = nowIso();
  await executeSql(
    `INSERT INTO sync_queue (kind, status, attempt_count, next_retry_at, last_error, created_at, updated_at)
     VALUES (?, 'pending', 0, NULL, NULL, ?, ?)`,
    [kind, ts, ts],
  );
}

export async function getDueSyncJobs(): Promise<SyncQueueRow[]> {
  await initDB();
  const ts = nowIso();
  const rs = await executeSql(
    `SELECT * FROM sync_queue
     WHERE status = 'pending'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY id ASC`,
    [ts],
  );
  const out: SyncQueueRow[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    out.push(rowFromDb(rs.rows.item(i) as Record<string, unknown>));
  }
  return out;
}

export async function markSyncJobRunning(id: number): Promise<void> {
  await executeSql(
    `UPDATE sync_queue SET status = 'running', updated_at = ? WHERE id = ?`,
    [nowIso(), id],
  );
}

export async function markSyncJobDone(id: number): Promise<void> {
  await executeSql(
    `UPDATE sync_queue SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?`,
    [nowIso(), id],
  );
}

export async function markSyncJobFailed(id: number, error: string, attemptCount: number): Promise<void> {
  const nextStatus: SyncQueueStatus =
    attemptCount >= MAX_SYNC_ATTEMPTS ? 'failed' : 'pending';
  const nextRetry = nextStatus === 'pending' ? computeNextRetryAt(attemptCount) : null;
  await executeSql(
    `UPDATE sync_queue
     SET status = ?, attempt_count = ?, next_retry_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [nextStatus, attemptCount, nextRetry, error.slice(0, 500), nowIso(), id],
  );
}

export async function resetSyncJobForRetry(kind: SyncQueueKind): Promise<void> {
  await initDB();
  await executeSql(
    `UPDATE sync_queue
     SET status = 'pending', attempt_count = 0, next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE kind = ? AND status IN ('pending', 'failed', 'running')`,
    [nowIso(), kind],
  );
  const rs = await executeSql(`SELECT id FROM sync_queue WHERE kind = ? AND status = 'pending'`, [
    kind,
  ]);
  if (rs.rows.length === 0) {
    await enqueueSyncJob(kind);
  }
}

export async function getSyncQueueSummary(): Promise<{
  pendingCount: number;
  failedCount: number;
  running: boolean;
  lastError: string | null;
}> {
  await initDB();
  const rs = await executeSql(
    `SELECT status, COUNT(*) as cnt FROM sync_queue
     WHERE status IN ('pending', 'failed', 'running')
     GROUP BY status`,
  );
  let pendingCount = 0;
  let failedCount = 0;
  let running = false;
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    const status = row.status as string;
    const cnt = Number(row.cnt);
    if (status === 'pending') pendingCount = cnt;
    if (status === 'failed') failedCount = cnt;
    if (status === 'running') running = true;
  }
  const errRs = await executeSql(
    `SELECT last_error FROM sync_queue
     WHERE last_error IS NOT NULL AND last_error != ''
     ORDER BY updated_at DESC LIMIT 1`,
  );
  const lastError =
    errRs.rows.length > 0 ? (errRs.rows.item(0).last_error as string) : null;
  return {pendingCount, failedCount, running, lastError};
}

export async function pruneDoneSyncJobs(): Promise<void> {
  await executeSql(`DELETE FROM sync_queue WHERE status = 'done'`);
}
