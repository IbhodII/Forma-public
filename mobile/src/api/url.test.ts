import {buildApiUrl, normalizeApiBaseUrl} from './url';

describe('normalizeApiBaseUrl', () => {
  it('strips trailing /api suffix', () => {
    expect(normalizeApiBaseUrl('http://192.168.1.10:8000/api')).toBe('http://192.168.1.10:8000');
    expect(normalizeApiBaseUrl('http://192.168.1.10:8000/api/')).toBe('http://192.168.1.10:8000');
  });

  it('adds http scheme when missing', () => {
    expect(normalizeApiBaseUrl('192.168.1.10:8000')).toBe('http://192.168.1.10:8000');
  });
});

describe('buildApiUrl', () => {
  it('builds health connect sync URL without double /api', () => {
    const url = buildApiUrl('http://192.168.1.10:8000/api', '/api/sync/health-connect');
    expect(url).toBe('http://192.168.1.10:8000/api/sync/health-connect');
    expect(url).not.toMatch(/\/api\/api\//);
  });
});
