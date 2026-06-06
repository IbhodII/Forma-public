import {bootstrapStoredSession} from '../sessionBootstrap';
import type {StoredSession} from '../session';

describe('bootstrapStoredSession', () => {
  const legacySession: StoredSession = {
    userId: 1,
    email: 'a@test.com',
    operatingMode: 'legacy_api',
    appMode: 'api',
  };

  it('restores autonomous session without calling API', async () => {
    const fetchMe = jest.fn();
    const session: StoredSession = {...legacySession, operatingMode: 'autonomous'};
    const result = await bootstrapStoredSession(session, fetchMe);
    expect(result.action).toBe('restore_local');
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it('keeps legacy session when fetchAuthMe fails', async () => {
    const fetchMe = jest.fn().mockRejectedValue(new Error('network'));
    const result = await bootstrapStoredSession(legacySession, fetchMe);
    expect(result.action).toBe('keep_offline');
    expect(result.session).toEqual(legacySession);
  });

  it('applies server session when fetchAuthMe succeeds', async () => {
    const fetchMe = jest.fn().mockResolvedValue({
      user_id: 2,
      username: 'user',
      email: 'b@test.com',
      cloud_provider: 'yandex',
    });
    const result = await bootstrapStoredSession(legacySession, fetchMe);
    expect(result.action).toBe('apply_server');
    if (result.action === 'apply_server') {
      expect(result.auth.user_id).toBe(2);
    }
  });
});
