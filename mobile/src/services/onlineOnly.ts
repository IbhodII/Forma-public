import {isOnline} from './network';

export class OnlineOnlyError extends Error {
  constructor(message = 'Доступно только при подключении к интернету') {
    super(message);
    this.name = 'OnlineOnlyError';
  }
}

export async function requireOnline(message?: string): Promise<void> {
  if (!(await isOnline())) {
    throw new OnlineOnlyError(message);
  }
}
