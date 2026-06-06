export type FormaSyncEntityType =
  | 'food_entries'
  | 'body_metrics'
  | 'strength_workouts'
  | 'stretching_log'
  | 'bracelet_calories'
  | 'hc_days'
  | 'cardio_workouts'
  | 'food_products'
  | 'strength_presets'
  | 'user_preferences';

export type FormaSyncJsonlRow = {
  id: string;
  server_id?: number | null;
  updated_at: string;
  deleted_at?: string | null;
  source: 'mobile' | 'desktop' | 'remote';
  device_id: string;
  payload: unknown | null;
};

const ENTITY_PREFIX: Record<FormaSyncEntityType, string> = {
  food_entries: 'food',
  body_metrics: 'body',
  strength_workouts: 'strength',
  stretching_log: 'stretching',
  bracelet_calories: 'bracelet',
  hc_days: 'hc',
  cardio_workouts: 'cardio',
  food_products: 'product',
  strength_presets: 'preset',
  user_preferences: 'prefs',
};

export function buildEntityId(
  entity: FormaSyncEntityType,
  origin: 'mobile' | 'desktop' | 'remote',
  localKey: string | number,
): string {
  if (entity === 'hc_days') {
    return `hc:health_connect:${localKey}`;
  }
  const prefix = ENTITY_PREFIX[entity];
  return `${prefix}:${origin}:${localKey}`;
}

export function parseEntityId(id: string): {
  entity: FormaSyncEntityType;
  origin: string;
  localKey: string;
} | null {
  const [kind, origin, ...rest] = id.split(':');
  const localKey = rest.join(':');
  if (!kind || !origin || !localKey) {
    return null;
  }
  if (kind === 'hc') {
    return {entity: 'hc_days', origin, localKey};
  }
  const map: Record<string, FormaSyncEntityType> = {
    food: 'food_entries',
    body: 'body_metrics',
    strength: 'strength_workouts',
    stretching: 'stretching_log',
    bracelet: 'bracelet_calories',
    cardio: 'cardio_workouts',
    product: 'food_products',
    preset: 'strength_presets',
    prefs: 'user_preferences',
  };
  const entity = map[kind];
  if (!entity) {
    return null;
  }
  return {entity, origin, localKey};
}

export function isCrossOrigin(origin: string): boolean {
  return origin === 'desktop' || origin === 'remote';
}
