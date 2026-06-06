import {countPendingSyncChanges} from './changeTracker';

export async function countPendingFormaSyncChanges(): Promise<number> {
  return countPendingSyncChanges();
}

export async function hasExportableChanges(): Promise<boolean> {
  return (await countPendingFormaSyncChanges()) > 0;
}

export {nowIso} from '../database/index';
