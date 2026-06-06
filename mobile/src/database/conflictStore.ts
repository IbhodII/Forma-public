import {executeSql, nowIso} from './index';

export type SyncConflictRow = {
  id: number;
  entity_type: string;
  entity_label: string;
  local_payload_json: string;
  server_payload_json: string | null;
  previous_payload_json: string | null;
  remote_updated_at: string | null;
  winner: 'local' | 'remote' | null;
  created_at: string;
  resolved: number;
};

export async function enqueueConflict(params: {
  entityType: string;
  entityLabel: string;
  localPayload: unknown;
  serverPayload?: unknown;
  previousPayload?: unknown;
  remoteUpdatedAt?: string;
  winner?: 'local' | 'remote';
}): Promise<number> {
  const rs = await executeSql(
    `INSERT INTO sync_conflicts
      (entity_type, entity_label, local_payload_json, server_payload_json,
       previous_payload_json, remote_updated_at, winner, created_at, resolved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      params.entityType,
      params.entityLabel,
      JSON.stringify(params.localPayload),
      params.serverPayload != null ? JSON.stringify(params.serverPayload) : null,
      params.previousPayload != null ? JSON.stringify(params.previousPayload) : null,
      params.remoteUpdatedAt ?? null,
      params.winner ?? null,
      nowIso(),
    ],
  );
  return rs.insertId ?? 0;
}

export async function listUnresolvedConflicts(): Promise<SyncConflictRow[]> {
  const rs = await executeSql(
    'SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY id DESC',
  );
  const out: SyncConflictRow[] = [];
  for (let i = 0; i < rs.rows.length; i++) {
    const row = rs.rows.item(i);
    out.push({
      id: row.id as number,
      entity_type: row.entity_type as string,
      entity_label: row.entity_label as string,
      local_payload_json: row.local_payload_json as string,
      server_payload_json: (row.server_payload_json as string | null) ?? null,
      previous_payload_json: (row.previous_payload_json as string | null) ?? null,
      remote_updated_at: (row.remote_updated_at as string | null) ?? null,
      winner: (row.winner as 'local' | 'remote' | null) ?? null,
      created_at: row.created_at as string,
      resolved: row.resolved as number,
    });
  }
  return out;
}

export async function resolveConflict(id: number): Promise<void> {
  await executeSql('UPDATE sync_conflicts SET resolved = 1 WHERE id = ?', [id]);
}

export async function countUnresolvedConflicts(): Promise<number> {
  const rs = await executeSql(
    'SELECT COUNT(*) as cnt FROM sync_conflicts WHERE resolved = 0',
  );
  return (rs.rows.item(0).cnt as number) || 0;
}
