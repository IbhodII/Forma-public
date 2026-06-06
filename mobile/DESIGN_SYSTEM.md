# Forma Mobile Design System

Single source of truth for the React Native app (`mobile/src/design-system/`).

Inspired by Linear, Apple Fitness, Notion, Stripe, and Hevy — calm surfaces, strong hierarchy, teal accent, subtle depth.

## Tokens (`tokens.ts`)

| Category | Keys |
|----------|------|
| **Colors** | `bg`, `surface`, `accent`, `text*`, `heroStart/End`, `tabBar*` |
| **Space** | `space[0–10]` — 4px grid (`space[4]` = 16) |
| **Radius** | `xs` → `pill` (8–999) |
| **Layout** | `screenPaddingX`, `cardPadding`, `blockGap`, `tabBarClearance` |
| **Typography** | `display`, `title1–3`, `body`, `caption`, `label`, `overline` |
| **Motion** | `pressScale`, `pressOpacity`, `disabledOpacity` |

Use `useDesignSystem()` (or legacy `useMobileTheme()` alias).

## Primitives

| Component | Use for |
|-----------|---------|
| `AppScreen` | Scroll + safe area + optional `AppHeader` + pull-to-refresh |
| `AppHeader` | Screen title / subtitle / right action |
| `AppHero` | Gradient hero blocks (home, workouts) |
| `AppSection` | Section overline + title + optional action |
| `AppCard` | Elevated / muted / outline surfaces |
| `AppButton` | Primary CTA → secondary → ghost → danger |
| `AppInput` | Label, hint, error states |
| `AppTabs` | Segmented control (mode switches) |
| `AppChip` | `pill` actions · `stat` metrics |
| `AppSheet` | Bottom sheets |
| `AppText` | Typed text colors |

## Hierarchy

1. **Primary** — `AppButton` variant `primary`, full width on key flows
2. **Secondary** — `secondary` / `soft` for alternate actions
3. **Tertiary** — `ghost` or text links in headers

## Spacing rhythm

- Screen horizontal: `layout.screenPaddingX` (16)
- Between sections: `layout.sectionGap` (20)
- Floating tab bar: `layout.tabBarFloatMarginH` (16), `tabBarFloatMarginB` (12), `tabBarRadius` (26)
- Between blocks in a screen: `layout.blockGap` (12)
- Inside cards: `layout.cardPadding` (16)

## Migration

- Import from `../design-system` or `../ui` (legacy barrel re-exports primitives).
- Replace raw `TextInput` → `AppInput`, custom heroes → `AppHero`.
- `Card` with `muted` prop still works via `ui/Card.tsx` wrapper.

## Shadows

`shadows.sm | md | cta | tabBar | tabBarFloat` from `useDesignSystem()` — tuned per light/dark in `shadows.ts`.

## Motion (`design-system/motion/`)

Built on **Reanimated 3** — subtle, spring-based, no flashy effects.

| Utility | Use |
|---------|-----|
| `PressableScale` | Tactile press (scale + opacity spring) |
| `useScreenEnter` | Tab screen fade + 6px lift on focus |
| `StaggerItem` | List/feed items (`index` prop) |
| `enterFadeDown` / `enterFadeUp` | Layout entering presets |
| `useSheetMotion` | Bottom sheet slide + backdrop + swipe dismiss |
| `AppFab` | Floating action with enter spring |

**Defaults:** `springs.snappy` for presses, `springs.gentle` for screens, `motion.staggerStep` 42ms between list items.

Primitives (`AppButton`, `AppCard`, `AppChip`, `AppTabs`, `AppSheet`, `AppHero`, `AppHeader`) already use motion internally.

## Polish primitives

| Component | Use |
|-----------|-----|
| `AppEmptyState` | Lists with no data — icon, title, optional CTA |
| `AppLoadingState` | Centered spinner + label |
| `AppErrorState` | Retry affordance for failed queries |
| `AppScreen` | `stickyFooter` for pinned CTAs; safe-area + tab clearance |

**Spacing:** `layout.blockGap` (16) between blocks, `layout.sectionGap` (24) between sections, `layout.screenPaddingX` (16) horizontal edges.
