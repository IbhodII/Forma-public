import {useEffect, useState} from 'react';

import {
  getBannerState,
  subscribeBannerState,
  type BannerState,
} from '../sync/syncOrchestrator';

export function useSyncStatusBanner(): BannerState {
  const [state, setState] = useState<BannerState>(() => getBannerState());

  useEffect(() => {
    return subscribeBannerState(setState);
  }, []);

  return state;
}
