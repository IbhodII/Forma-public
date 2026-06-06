export type NormalizedSex = 'female' | 'male' | 'other' | 'unknown';

type ProfileLike = {
  sex?: unknown;
  gender?: unknown;
} | null | undefined;

function normalizeSexValue(value: unknown): NormalizedSex {
  if (typeof value !== 'string') {
    return 'unknown';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'female' || normalized === 'woman' || normalized === 'f') {
    return 'female';
  }
  if (normalized === 'male' || normalized === 'man' || normalized === 'm') {
    return 'male';
  }
  if (normalized === 'other' || normalized === 'non-binary' || normalized === 'nonbinary') {
    return 'other';
  }
  if (normalized === 'unknown' || normalized === 'skip' || normalized === '') {
    return 'unknown';
  }
  return 'unknown';
}

export function resolveProfileSex(
  profile: ProfileLike,
  fallback?: unknown,
): NormalizedSex {
  const primary = normalizeSexValue(profile?.sex ?? profile?.gender);
  if (primary !== 'unknown') {
    return primary;
  }
  return normalizeSexValue(fallback);
}

export function isFemaleProfile(
  profile: ProfileLike,
  fallback?: unknown,
): boolean {
  return resolveProfileSex(profile, fallback) === 'female';
}
