import {StyleSheet, type ViewStyle} from 'react-native';

import {useDesignSystem} from '../design-system/useDesignSystem';
import {useScreenInsets} from './useScreenInsets';

/**
 * Layout helpers for tab-root screens.
 *
 * - AppScreen applies `useTabBarBottomInset` on the body (scroll and scroll={false}).
 * - Do not set `noPadding` on AppScreen unless a child truly needs edge-to-edge width.
 * - `useFlexTabListBottomPad`: small end gap only — parent already reserved tab bar space.
 * - `useNestedScrollBottomPad`: full tab clearance — only for standalone nested scrolls
 *   outside AppScreen padding (rare).
 */

/** End padding for nested ScrollViews inside tab screens (clears measured tab bar). */
export function useNestedScrollBottomPad() {
  const {bottom} = useScreenInsets();
  const {layout} = useDesignSystem();
  return bottom + layout.blockGapCompact;
}

/** End padding for FlatLists inside `flexTabPanel` (parent `AppScreen` already pads). */
export function useFlexTabListBottomPad() {
  const {layout} = useDesignSystem();
  return layout.blockGap;
}

/** Scroll content container with bottom inset for tab bar. */
export function scrollContent(bottomInset: number, gap = 12): ViewStyle {
  return {
    paddingBottom: bottomInset,
    gap,
  };
}

/** Bounded flex panel for tab bodies inside AppScreen scroll={false}. */
export const flexTabPanel: ViewStyle = {
  flex: 1,
  minHeight: 0,
};

export const stickyHeader = StyleSheet.create({
  bar: {
    zIndex: 2,
    elevation: 2,
  },
});
