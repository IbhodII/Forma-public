import {
  formaSyncManifestPath,
  formaSyncPackagePath,
  formaSyncPackageRelativePath,
  formaSyncRootPath,
} from '../formaSyncPaths';
import {nextRevision, packageFilename, parseManifest} from '../manifest';

describe('manifest', () => {
  it('parses valid manifest', () => {
    const raw = JSON.stringify({
      schema_version: 1,
      revision: 42,
      updated_at: '2026-05-30T12:00:00Z',
      source_device: 'mobile',
      source_device_id: 'dev-1',
      package: 'packages/000042-mobile.zip',
      package_sha256: 'abc',
      entities_summary: {food_entries: 1},
    });
    const m = parseManifest(raw);
    expect(m?.revision).toBe(42);
    expect(m?.schema_version).toBe(1);
  });

  it('rejects invalid schema_version', () => {
    expect(parseManifest(JSON.stringify({schema_version: 2, revision: 1}))).toBeNull();
  });

  it('computes next revision', () => {
    expect(nextRevision(3, 5)).toBe(6);
    expect(nextRevision(10, null)).toBe(11);
  });

  it('pads package filename', () => {
    expect(packageFilename(1, 'mobile')).toBe('000001-mobile.zip');
    expect(formaSyncPackageRelativePath(7, 'desktop')).toBe('packages/000007-desktop.zip');
  });
});

describe('formaSyncPaths', () => {
  it('builds yandex paths', () => {
    expect(formaSyncRootPath('123')).toBe('app:/FormaSync/123');
    expect(formaSyncManifestPath('123')).toBe('app:/FormaSync/123/manifest.json');
    expect(formaSyncPackagePath('123', 1, 'mobile')).toBe('app:/FormaSync/123/packages/000001-mobile.zip');
  });
});
