import {getApiBaseUrl} from '../../config/apiBase';
import {getStoredOperatingMode} from '../../auth/session';
import {syncOnboardingToBackend} from '../persist';
import {EMPTY_DRAFT} from '../types';
import {saveNutritionSettings, saveUserProfile} from '../../api/user';

jest.mock('../../auth/session', () => ({
  getStoredOperatingMode: jest.fn(),
}));

jest.mock('../../config/apiBase', () => ({
  getApiBaseUrl: jest.fn(),
}));

jest.mock('../../api/user', () => ({
  saveUserProfile: jest.fn(),
  saveNutritionSettings: jest.fn(),
}));

describe('syncOnboardingToBackend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops for autonomous mode', async () => {
    (getStoredOperatingMode as jest.Mock).mockResolvedValue('autonomous');
    await syncOnboardingToBackend({...EMPTY_DRAFT, sex: 'male'});
    expect(saveUserProfile).not.toHaveBeenCalled();
    expect(getApiBaseUrl).not.toHaveBeenCalled();
  });

  it('no-ops for legacy when API base missing', async () => {
    (getStoredOperatingMode as jest.Mock).mockResolvedValue('legacy_api');
    (getApiBaseUrl as jest.Mock).mockResolvedValue('');
    await syncOnboardingToBackend({...EMPTY_DRAFT, sex: 'male'});
    expect(saveUserProfile).not.toHaveBeenCalled();
  });
});
