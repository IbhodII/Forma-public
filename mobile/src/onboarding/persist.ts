import {getApiBaseUrl} from '../config/apiBase';
import {getStoredOperatingMode} from '../auth/session';
import {logStartup} from '../debug/startupLog';
import {requiresPcApi} from '../mode/operatingMode';
import {
  ONBOARDING_PC_SYNC_MS,
  withTimeout,
} from '../startup/startupWatchdog';
import {saveNutritionSettings, saveUserProfile} from '../api/user';
import type {ActivityLevel, OnboardingDraft, OnboardingPreferences} from './types';

function mapActivity(level: ActivityLevel | null): 'sedentary' | 'active' | null {
  if (!level) {
    return null;
  }
  return level === 'light' ? 'sedentary' : 'active';
}

export async function syncOnboardingToBackend(draft: OnboardingDraft): Promise<void> {
  const mode = (await getStoredOperatingMode()) ?? 'autonomous';
  if (!requiresPcApi(mode)) {
    logStartup('onboarding', 'pc_api_skipped local-first mode');
    return;
  }
  const base = await getApiBaseUrl();
  if (!base) {
    logStartup('onboarding', 'pc_api_skipped no API base URL');
    return;
  }

  const tasks: Promise<unknown>[] = [];

  if (draft.sex === 'female' || draft.sex === 'male') {
    tasks.push(
      saveUserProfile({
        sex: draft.sex,
      }),
    );
  }

  const activity = mapActivity(draft.activityLevel);
  if (activity) {
    tasks.push(
      saveNutritionSettings({
        activity_level: activity,
      }),
    );
  }

  if (tasks.length === 0) {
    return;
  }

  await withTimeout(Promise.all(tasks), ONBOARDING_PC_SYNC_MS, 'onboarding_pc_sync');
}

export function draftToPreferences(draft: OnboardingDraft): OnboardingPreferences {
  return {
    ...draft,
    version: 1,
    completedAt: new Date().toISOString(),
  };
}
