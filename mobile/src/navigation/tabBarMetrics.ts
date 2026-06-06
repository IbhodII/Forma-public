/** Tab bar inner row height (icons + labels + slot padding). */
export const TAB_BAR_CONTENT_HEIGHT = 50;

/** Vertical padding on the dock bar row. */
export const TAB_BAR_VERTICAL_PADDING = 4;

/**
 * Chrome above the home indicator (excludes safe-area).
 * Bar uses minHeight + paddingVertical.
 */
export const TAB_BAR_CHROME_HEIGHT =
  TAB_BAR_CONTENT_HEIGHT + TAB_BAR_VERTICAL_PADDING * 2;

/** Bottom lift of floating dock above safe area. */
export const TAB_BAR_FLOAT_MARGIN_BOTTOM = 12;

/** Extra clearance for float margin + shadow breathing room. */
export const TAB_BAR_CLEARANCE_BUFFER = 20;

/** Scroll/footer clearance below content (chrome + float margin, no safe-area). */
export const TAB_BAR_CLEARANCE =
  TAB_BAR_CHROME_HEIGHT + TAB_BAR_FLOAT_MARGIN_BOTTOM + TAB_BAR_CLEARANCE_BUFFER;
