import AsyncStorage from '@react-native-async-storage/async-storage';

import type {OnboardingDraft, OnboardingPreferences} from './types';
import {EMPTY_DRAFT} from './types';

const COMPLETE_KEY = 'forma_onboarding_v1_complete';
const PREFS_KEY = 'forma_onboarding_v1_prefs';
const DRAFT_KEY = 'forma_onboarding_v1_draft';

export async function isOnboardingComplete(): Promise<boolean> {
  const v = await AsyncStorage.getItem(COMPLETE_KEY);
  return v === '1';
}

export async function loadOnboardingDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return {...EMPTY_DRAFT};
    }
    return {...EMPTY_DRAFT, ...JSON.parse(raw)};
  } catch {
    return {...EMPTY_DRAFT};
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadOnboardingPreferences(): Promise<OnboardingPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as OnboardingPreferences;
  } catch {
    return null;
  }
}

export async function completeOnboarding(prefs: OnboardingPreferences): Promise<void> {
  await AsyncStorage.multiSet([
    [COMPLETE_KEY, '1'],
    [PREFS_KEY, JSON.stringify(prefs)],
  ]);
  await AsyncStorage.removeItem(DRAFT_KEY);
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.multiRemove([COMPLETE_KEY, PREFS_KEY, DRAFT_KEY]);
}
