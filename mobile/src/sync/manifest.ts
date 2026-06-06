export type FormaSyncEntitiesSummary = {
  food_entries?: number;
  body_metrics?: number;
  strength_workouts?: number;
  stretching_log?: number;
  bracelet_calories?: number;
  hc_days?: number;
  cardio_workouts?: number;
  food_products?: number;
  strength_presets?: number;
  user_preferences?: number;
};

export type FormaSyncManifest = {
  schema_version: 1;
  revision: number;
  updated_at: string;
  source_device: 'mobile' | 'desktop';
  source_device_id: string;
  package: string;
  package_sha256: string;
  entities_summary: FormaSyncEntitiesSummary;
};

export function parseManifest(raw: string): FormaSyncManifest | null {
  try {
    const data = JSON.parse(raw) as FormaSyncManifest;
    if (data.schema_version !== 1 || typeof data.revision !== 'number') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function serializeManifest(manifest: FormaSyncManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function packageFilename(revision: number, sourceDevice: 'mobile' | 'desktop'): string {
  return `${String(revision).padStart(6, '0')}-${sourceDevice}.zip`;
}

export function nextRevision(localLastSeen: number, remoteRevision: number | null): number {
  const base = Math.max(localLastSeen, remoteRevision ?? 0);
  return base + 1;
}
