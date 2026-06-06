import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';

import {resetOnboarding} from './storage';
import {OnboardingFlow} from './OnboardingFlow';

type Ctx = {
  requestReplay: () => void;
};

const OnboardingGateContext = createContext<Ctx>({requestReplay: () => {}});

export function useOnboardingGate() {
  return useContext(OnboardingGateContext);
}

type Props = {
  children: React.ReactNode;
  needsOnboarding: boolean;
  onOnboardingDone: () => void;
};

export function OnboardingGateProvider({children, needsOnboarding, onOnboardingDone}: Props) {
  const [replay, setReplay] = useState(false);

  const requestReplay = useCallback(() => {
    void resetOnboarding().then(() => setReplay(true));
  }, []);

  const value = useMemo(() => ({requestReplay}), [requestReplay]);

  if (needsOnboarding || replay) {
    return (
      <OnboardingGateContext.Provider value={value}>
        <OnboardingFlow
          onComplete={() => {
            setReplay(false);
            onOnboardingDone();
          }}
        />
      </OnboardingGateContext.Provider>
    );
  }

  return (
    <OnboardingGateContext.Provider value={value}>{children}</OnboardingGateContext.Provider>
  );
}
