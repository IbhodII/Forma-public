import {executeSql, nowIso} from '../database/index';
import {resolveConflict, type SyncConflictRow} from '../database/conflictStore';
import type {FoodPhase} from '../types/food';
import {parseEntityId} from './entityTypes';

async function applyServerFoodPayload(
  entityLabel: string,
  serverPayloadJson: string,
  remoteUpdatedAt: string | null,
): Promise<void> {
  const parsed = parseEntityId(entityLabel);
  if (!parsed || parsed.entity !== 'food_entries') {
    return;
  }
  const incomingPayload = JSON.parse(serverPayloadJson) as Record<string, unknown>;
  const updatedAt = remoteUpdatedAt ?? nowIso();
  const phase = (incomingPayload.phase as FoodPhase) ?? 'cut';
  const date = (incomingPayload.date as string) ?? updatedAt.slice(0, 10);

  const rs = await executeSql('SELECT id FROM food_entries WHERE id = ?', [Number(parsed.localKey)]);
  if (rs.rows.length > 0) {
    const id = rs.rows.item(0).id as number;
    await executeSql(
      `UPDATE food_entries SET payload_json = ?, updated_at = ?, deleted = 0, deleted_at = NULL,
       synced = 0, sync_status = 'pending' WHERE id = ?`,
      [JSON.stringify(incomingPayload), updatedAt, id],
    );
    return;
  }

  await executeSql(
    `INSERT INTO food_entries (date, phase, payload_json, synced, deleted, updated_at, sync_status)
     VALUES (?, ?, ?, 0, 0, ?, 'pending')`,
    [date, phase, JSON.stringify(incomingPayload), updatedAt],
  );
}

export async function applyConflictChoice(
  row: SyncConflictRow,
  choice: 'local' | 'server',
): Promise<void> {
  if (row.entity_type === 'food_entries' && choice === 'server' && row.server_payload_json) {
    await applyServerFoodPayload(row.entity_label, row.server_payload_json, row.remote_updated_at);
  }
  await resolveConflict(row.id);
}
