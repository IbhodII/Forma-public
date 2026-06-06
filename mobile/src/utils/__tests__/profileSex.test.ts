import {isFemaleProfile, resolveProfileSex} from '../profileSex';

describe('profileSex resolver', () => {
  it('resolves female from sex and supports case-insensitive values', () => {
    expect(resolveProfileSex({sex: 'female'})).toBe('female');
    expect(resolveProfileSex({sex: 'FEMALE'})).toBe('female');
  });

  it('falls back to gender when sex is missing', () => {
    expect(resolveProfileSex({gender: 'male'})).toBe('male');
  });

  it('uses onboarding fallback when profile is empty', () => {
    expect(resolveProfileSex(undefined, 'female')).toBe('female');
    expect(isFemaleProfile(undefined, 'female')).toBe(true);
  });

  it('returns unknown for unsupported values', () => {
    expect(resolveProfileSex({sex: 'skip'})).toBe('unknown');
    expect(resolveProfileSex({sex: 'x'})).toBe('unknown');
  });
});
