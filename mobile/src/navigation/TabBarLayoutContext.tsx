import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';

import {
  TAB_BAR_CHROME_HEIGHT,
  TAB_BAR_CLEARANCE_BUFFER,
} from './tabBarMetrics';

type TabBarLayout = {
  /** Full absolute wrapper height including safe-area padding. */
  totalHeight: number;
  /** Chrome only (total minus safe-area padding reported with layout). */
  chromeHeight: number;
  /** Clearance for scroll content: max(measured chrome, constant) + buffer. */
  clearance: number;
};

type TabBarLayoutContextValue = {
  layout: TabBarLayout | null;
  setWrapperLayout: (totalHeight: number, safeAreaPadding: number) => void;
};

const FALLBACK_EXTRA = 8;

const TabBarLayoutContext = createContext<TabBarLayoutContextValue>({
  layout: null,
  setWrapperLayout: () => {},
});

export function TabBarLayoutProvider({children}: {children: React.ReactNode}) {
  const [layout, setLayout] = useState<TabBarLayout | null>(null);

  const setWrapperLayout = useCallback((totalHeight: number, safeAreaPadding: number) => {
    const chromeHeight = Math.max(0, totalHeight - safeAreaPadding);
    const clearance = Math.max(chromeHeight, TAB_BAR_CHROME_HEIGHT) + TAB_BAR_CLEARANCE_BUFFER;
    setLayout({totalHeight, chromeHeight, clearance});
  }, []);

  const value = useMemo(() => ({layout, setWrapperLayout}), [layout, setWrapperLayout]);

  return <TabBarLayoutContext.Provider value={value}>{children}</TabBarLayoutContext.Provider>;
}

export function useTabBarLayout() {
  return useContext(TabBarLayoutContext).layout;
}

export function useTabBarLayoutActions() {
  return useContext(TabBarLayoutContext).setWrapperLayout;
}

/** Bottom inset for scroll content: safe-area + tab clearance (measured or constant). */
export function useTabBarBottomInset(fallbackSafeBottom: number) {
  const tabBar = useTabBarLayout();
  if (tabBar) {
    return tabBar.totalHeight;
  }
  return (
    fallbackSafeBottom + TAB_BAR_CHROME_HEIGHT + TAB_BAR_CLEARANCE_BUFFER + FALLBACK_EXTRA
  );
}
