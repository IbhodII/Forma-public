# UI guidelines (Forma)

Визуальный язык и UX-правила для **desktop** (Vite + Electron) и ориентиры для **mobile** (React Native design system).

Last updated: 2026-05-30.

---

## Philosophy

### Desktop

- **Clarity over density** — сводка дня на `/home`, детали по клику.
- **One accent** — `--app-accent` для CTA и активных ссылок.
- **Soft surfaces** — glass hero, лёгкие границы, без тяжёлых рамок.
- **Data-first** — tabular nums для метрик, sparklines для трендов.

### Mobile

- **Thumb-first** — bottom tab bar, min touch 44px.
- **Opaque chrome** — tab bar без blur; контент не уезжает под nav (`tabBarClearance`).
- **Design system only** — `AppCard`, `AppText`, tokens from `tokens.ts` (no magic hex in screens).

---

## Design tokens (desktop)

**Global:** `frontend/src/index.css`

| Token | Usage |
|-------|-------|
| `--app-bg`, `--app-surface` | Page and card backgrounds |
| `--app-text`, `--app-text-muted` | Primary / secondary text |
| `--app-border`, `--app-border-soft` | Dividers |
| `--app-accent` | Links, primary buttons, active nav |
| `--app-radius-card`, `--app-radius-input` | 12px default |
| `--app-shadow-sm`, `--app-shadow-md` | Elevated cards |

**Dashboard:** `frontend/src/pages/Home/dashboard/dashboard.css` on `.dashboard-v2`

| Token | Usage |
|-------|-------|
| `--dash-gap` | Section spacing (1rem → 1.25rem) |
| `--dash-hero-gap` | Hero metrics grid gap |
| `--dash-section-gap` | Panel internal spacing |
| `--dash-radius`, `--dash-radius-lg` | Cards 14px / 18px |

**Theme:** `ThemeContext` — `light` | `dark` | `system`, class `html.dark`.

Usage: `rgb(var(--app-accent))`, `rgb(var(--app-border) / 0.45)`.

---

## Spacing system

| Level | Desktop | Mobile (`tokens.ts`) |
|-------|---------|----------------------|
| Screen padding | `dashboard-shell` px | `layout.screenPaddingX` (14) |
| Block gap | `--dash-gap` | `layout.blockGap` (12) |
| Compact | `space-y-4` in panels | `blockGapCompact` (8) |
| Hero | `--dash-hero-gap` | `AppHero` min height 72–88 |

---

## Typography

| Element | Desktop class / style |
|---------|----------------------|
| Hero title | `.dashboard-hero__title` — large, bold |
| Metric value | `.dashboard-metric-tile` — 2xl–3xl tabular-nums |
| Section label | `.dashboard-section-label` — small caps muted |
| Panel title | `.dashboard-panel` title row |

Mobile: `typography` scale in `design-system/tokens.ts` (`title`, `body`, `caption`).

---

## Corner radius

| Component | Radius |
|-----------|--------|
| Metric tile | `--dash-radius` (~14px) |
| Load card / panel | `--dash-radius-lg` |
| Buttons | pill / 12px (`dashboard-primary-btn`) |
| Mobile cards | `radius.md` (14), sheets `radius.lg` (16) |

---

## Card hierarchy (desktop)

1. **Metric tile** — hero KPI, optional progress bar + `MiniSparkline`.
2. **Panel** — bordered «Сегодня» block.
3. **Load card** — full-width link card to `/analytics`.
4. **Integration card** — sync status in right column.

---

## Iconography

- **Library:** [lucide-react](https://lucide.dev) on desktop.
- **Mobile:** Ionicons in tab bar (`navigation/tabBarIcons.ts`).
- Icon in colored circle on metric tiles (`.dashboard-metric-tile__icon--{variant}`).

---

## Interactive states

| State | Pattern |
|-------|---------|
| Hover | Load card lift + border accent; links underline |
| Focus | Visible focus ring on buttons (accessibility) |
| Loading | `Skeleton` tiles, «Загрузка…» in load card sub |
| Empty | `dashboardEmpty` copy — actionable hint |

Avoid animating layout-heavy properties; prefer opacity and shadow.

---

## Progress and charts

- Hero tiles: thin progress bars (`dashboard-progress-bar`).
- Sparklines: `MiniSparkline` (Food diary component reused on home).
- Analytics: Plotly charts on `/analytics` (separate from home).

---

## Layout widths

| Shell | Max width |
|-------|-----------|
| `dashboard-shell` | up to ~120rem ultrawide |
| Settings | `settings-hub__layout` sidebar 220–240px |
| Sidebar nav | 220px / ~68px collapsed |

---

## Animations

- Restrained: CSS transitions on hover (~200ms).
- No gratuitous page transitions.
- FormaSync progress overlay — staged steps (client-side), not fake backend %.

---

## Related

- [DESKTOP_UI.md](./DESKTOP_UI.md) — page structure
- [MOBILE_PARITY.md](./MOBILE_PARITY.md) — mobile design system contract
- `mobile/src/design-system/tokens.ts` — mobile tokens source of truth
