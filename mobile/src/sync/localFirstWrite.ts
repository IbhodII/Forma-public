import {notifyLocalChange} from './syncOrchestrator';

export async function localFirstWrite<T>(opts: {
  persist: () => Promise<T>;
  afterPersist?: () => void | Promise<void>;
}): Promise<T> {
  const result = await opts.persist();
  if (opts.afterPersist) {
    await opts.afterPersist();
  }
  notifyLocalChange();
  return result;
}
