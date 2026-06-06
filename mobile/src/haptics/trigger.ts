import * as ExpoHaptics from 'expo-haptics';
import {Platform} from 'react-native';

import type {HapticKind} from './types';

let enabled = true;
const lastByKind = new Map<HapticKind, number>();

/** Per-intent cooldown — prevents noisy stacks while allowing layered feedback */
const COOLDOWN_MS: Record<HapticKind, number> = {
  selection: 28,
  tab: 44,
  toggle: 32,
  step: 34,
  light: 40,
  soft: 48,
  medium: 56,
  cta: 72,
  setComplete: 140,
  save: 220,
  success: 200,
  warning: 120,
  milestone: 2400,
  sheetOpen: 90,
  sheetClose: 70,
};

function canFire(kind: HapticKind): boolean {
  if (!enabled || Platform.OS === 'web') {
    return false;
  }
  const now = Date.now();
  const gap = COOLDOWN_MS[kind];
  const last = lastByKind.get(kind) ?? 0;
  if (now - last < gap) {
    return false;
  }
  lastByKind.set(kind, now);
  return true;
}

async function safeRun(kind: HapticKind, task: () => Promise<void>): Promise<void> {
  if (!canFire(kind)) {
    return;
  }
  try {
    await task();
  } catch {
    // Simulator / unsupported hardware
  }
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  if (!value) {
    lastByKind.clear();
  }
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runKind(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'selection':
    case 'tab':
    case 'toggle':
      await ExpoHaptics.selectionAsync();
      break;
    case 'step':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
      break;
    case 'light':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
      break;
    case 'soft':
    case 'sheetOpen':
    case 'sheetClose':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft);
      break;
    case 'setComplete':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft);
      break;
    case 'medium':
    case 'cta':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
      break;
    case 'save':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
      await delay(48);
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft);
      break;
    case 'success':
      await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning);
      break;
    case 'milestone':
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft);
      await delay(56);
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
      break;
    default:
      break;
  }
}

/** Fire a single premium haptic impulse */
export function trigger(kind: HapticKind): void {
  void safeRun(kind, () => runKind(kind));
}

export const haptics = {
  selection: () => trigger('selection'),
  tab: () => trigger('tab'),
  toggle: () => trigger('toggle'),
  step: () => trigger('step'),
  light: () => trigger('light'),
  soft: () => trigger('soft'),
  medium: () => trigger('medium'),
  cta: () => trigger('cta'),
  setComplete: () => trigger('setComplete'),
  save: () => trigger('save'),
  success: () => trigger('success'),
  warning: () => trigger('warning'),
  milestone: () => trigger('milestone'),
  sheetOpen: () => trigger('sheetOpen'),
  sheetClose: () => trigger('sheetClose'),
};
