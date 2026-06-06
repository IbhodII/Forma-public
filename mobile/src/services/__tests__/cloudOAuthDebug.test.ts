import {parseOAuthCallbackUrl} from '../cloudOAuthDebug';

describe('parseOAuthCallbackUrl', () => {
  it('parses implicit token from hash fragment', () => {
    const parsed = parseOAuthCallbackUrl(
      'myhealthdashboard://oauth/yandex#access_token=abc123&token_type=bearer&expires_in=3600',
    );
    expect(parsed.hash.access_token).toBe('abc123');
    expect(parsed.hash.expires_in).toBe('3600');
    expect(parsed.query.access_token).toBeUndefined();
  });

  it('parses authorization code from query', () => {
    const parsed = parseOAuthCallbackUrl(
      'myhealthdashboard://oauth/yandex?code=xyz&state=1',
    );
    expect(parsed.query.code).toBe('xyz');
  });
});
