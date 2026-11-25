# Design system

Product and demo share one brand: **Carbon Navy 60% · Glacier Sage 30% · Yuzu Neon 10%**.

- Brand rules: [brand-guidelines.md](./brand-guidelines.md)
- Token → shell → feature layering: [architecture.md](./architecture.md)
- Product tokens: `apps/web/src/styles/brand.css`
- Demo Tailwind map: `apps/web/src/app/demo/demo.css` (still scoped under `.mos`)

## Direction

- **Mood**: precise, calm, optimistic. Navy for structure; sage for air; yuzu for the next action.
- **Style**: translucent sage glass over carbon, ambient grid, soft yuzu glow.
- **Density**: dashboard density with 4/8 px spacing. Panels use 16–24 px padding.
- **Source**: `ui-ux-pro-max` design-system search for B2B SaaS marketing ops, then palette replaced with the brand ratio above. Orange CTA from the generator was dropped for yuzu.

## Colour tokens

Use semantic names only (`bg`, `surface`, `muted`, `primary` / accent). They map to CSS variables.

| Token | Product (dark) | Demo light | Use |
| --- | --- | --- | --- |
| `bg` | `#1B2130` carbon | `#E7EEE9` sage wash | Page background |
| `surface` | sage @ 10% | white glass | Interactive panels |
| `surface-2` | sage @ 16% | `#D5E0DA` | Inputs, rows |
| `border` | sage @ 28% | carbon @ 12% | Dividers |
| `fg` | `#F2F6F4` | carbon | Primary text |
| `muted` | `#B8C7C0` sage | `#4A5853` | Secondary text |
| `primary` / `accent` | `#E8FF2A` yuzu | carbon / muted yuzu | CTA, focus, active nav |
| `on-accent` | carbon | — | Text on yuzu |
| `success` / `warning` / `danger` | tinted functional hues | darker on light | Status (always with a word) |

Recharts still reads literals from `useChartColors()` in the demo theme helper. Prefer yuzu → sage ramps for series.

## Typography

| Role | Font | Notes |
| --- | --- | --- |
| UI and headings | Plus Jakarta Sans (`--font-plus-jakarta`) | `next/font`, CSP-safe |
| Numbers, code | JetBrains Mono (`--font-jetbrains`) | Ask plans, IDs |

Numbers use `.tabular`. Headings use tight tracking.

## Utilities

| Class | What it does |
| --- | --- |
| `.glass` | Translucent surface, blur, hairline border |
| `.focus-ring` / focus-visible on controls | 2px yuzu outline |
| `.tabular` | Tabular figures |
| `.mos-ambient` | Fixed grid + drifting glow |
| `.app-shell` / `.app-sidebar` / `.app-content` | Product chrome |
| `.mos-btn` / `.mos-input` / `.mos-table` | `@marketing-os/ui` hooks |

## Motion

Product chrome uses CSS only (ambient drift, 160ms hovers). Demo keeps Motion (`motion/react`) patterns from before.

Rules:

- Animate `transform` and `opacity` only where motion exists.
- Exits faster than entrances.
- `prefers-reduced-motion` disables ambient keyframes.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `AppShell` | `components/app-shell.tsx` | Portal + console chrome |
| `PortalFrame` / `ConsoleFrame` | `workspace.tsx` / `console-frame.tsx` | Wire auth + nav into shell |
| `Button`, `Input`, `Table`, empty/error | `packages/ui` | Presentational classes only |
| Demo `Card`, `KpiCard`, charts | `demo/components/ui/*` | Investor mockup |

Icons: Lucide (demo). Decorative icons stay `aria-hidden`.

## Accessibility

- Text meets 4.5:1 on carbon with `--mos-fg`; muted uses `#C5D4CD`.
- Yuzu / primary fills use `--mos-on-primary` / `--mos-ink` (never white on neon).
- Status is never colour alone; active nav also uses an inset bar.
- Focus is visible (3px). Primary buttons use a light ring + carbon halo.
- Skip link + `#main-content` landmark on product shells.
- Keyboard order follows visual order; hit targets ≥44px.
