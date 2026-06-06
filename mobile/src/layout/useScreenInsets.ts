import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useDesignSystem} from '../design-system/useDesignSystem';
import {useTabBarBottomInset} from '../navigation/TabBarLayoutContext';

/**
 * Unified screen insets for tab-root screens and custom ScrollViews.
 * `bottom` clears the floating tab bar (safe-area + chrome, measured when available).
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const {layout} = useDesignSystem();
  const safeBottom = Math.max(insets.bottom, 0);
  const bottom = useTabBarBottomInset(safeBottom);
  const tabBarClearance = bottom - safeBottom;

  return {
    top: insets.top,
    bottom,
    left: insets.left,
    right: insets.right,
    safeBottom,
    tabBarClearance,
    /** Fallback when tab bar context not mounted (e.g. modals). */
    tabBarClearanceFallback: layout.tabBarClearance,
  };
}
