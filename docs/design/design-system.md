# Design system

The demo uses a glassmorphism style on blue and slate grey. The tokens and utilities live in `apps/web/src/app/demo/demo.css` and apply only inside the `.mos` wrapper, so the rest of the web app is unaffected.

## Direction

- **Mood**: calm, data-dense, trustworthy. Blue for action and focus; grey for structure.
- **Style**: translucent cards (`.glass`) over a dark navy background with a slow ambient glow and a faint grid.
- **Density**: dashboard density with 4/8 px spacing. Cards use 20–24 px padding.
- **Source**: generated with the `ui-ux-pro-max` design-system search for "B2B SaaS marketing analytics dashboard", then adjusted. The generator suggested an orange call-to-action colour; it was dropped to keep the palette blue and grey.

## Colour tokens

Use the semantic Tailwind names (`bg-surface`, `text-muted`, `border-border`, `text-primary` …). They map to CSS variables, so both themes work without per-screen colours.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `bg` | `#070b16` | `#f4f7fb` | Page background |
| `surface` | `rgb(17 25 43 / .66)` | `rgb(255 255 255 / .82)` | Cards (glass) |
| `surface-2` | `#172036` | `#eef2f7` | Inputs, rows, tiles |
| `border` | `rgb(148 163 184 / .13)` | `rgb(15 23 42 / .09)` | Dividers and outlines |
| `fg` | `#e8eef7` | `#0f172a` | Primary text |
| `muted` | `#94a3b8` | `#475569` | Secondary text |
| `primary` | `#3b82f6` | `#2563eb` | Buttons, links, focus, main series |
| `primary-strong` | `#2563eb` | `#1d4ed8` | Hover and pressed |
| `accent` | `#60a5fa` | `#3b82f6` | Highlights, second series |
| `success` | `#34d399` | `#047857` | Healthy, positive change |
| `warning` | `#fbbf24` | `#b45309` | Delayed, medium confidence |
| `danger` | `#f87171` | `#dc2626` | Errors, negative change |
| `violet` | `#a78bfa` | `#6d28d9` | AI and agent activity |

Light-theme status colours are darker shades so that small text keeps a 4.5:1 contrast on white.

Recharts needs literal colour values, so charts read them from `useChartColors()` in `components/theme.tsx`. The chart series ramp is blue to slate.

## Typography

| Role | Font | Notes |
| --- | --- | --- |
| UI and headings | Inter (`--font-inter`) | Loaded with `next/font/google`, self-hosted, so the CSP `font-src 'self'` holds |
| Numbers, code, query plans | JetBrains Mono (`--font-jetbrains`) | Used for the SQL in Ask Marketing and IDs |

Numbers use `.tabular` (tabular figures) so values do not jump while they animate. Headings use tight tracking; body text is 14 px in the app and 16–18 px on the landing page.

## Utilities

| Class | What it does |
| --- | --- |
| `.glass` | Translucent surface, blur, hairline border, soft shadow |
| `.glow-ring` | Blue outer glow for the active or highlighted card |
| `.focus-ring` | Visible 2 px focus outline for custom controls |
| `.tabular` | Tabular figures |
| `.mos-ambient` | Fixed background with drifting glow and grid |
| `.flow-line` | Animated dashes along workflow edges |
| `.shimmer` | Loading shimmer for the "thinking" state |

## Motion

Motion is done with Motion (`motion/react`).

| Pattern | Where | Timing |
| --- | --- | --- |
| Staggered reveal on mount | Every page (`Stagger`, `RevealItem`) | 40–60 ms stagger, ~400 ms ease-out |
| Count-up numbers | KPI cards, stats (`AnimatedNumber`) | ~1 s |
| Shared-layout indicator | Sidebar active item, segmented controls | Spring |
| Page transition | Shell `main`, keyed by route | Fade and 8 px rise |
| List reorder | Sortable campaign table, recommendations | `layout` animation |
| Typewriter | Ask Marketing answers | 3 characters every 16 ms |
| Evidence stepper | Ask Marketing query plan | One step every 420 ms |
| Workflow run | Automations canvas | One node every 900 ms |
| Tilt on hover | Landing hero preview | Spring, up to ±8° |

Rules:

- Animate `transform` and `opacity` only. No animated layout properties outside `layout` animations.
- Exits are faster than entrances.
- Motion explains a change (a value updates, an item moves, a step completes). It does not loop for decoration, except the slow ambient background.
- `MotionConfig reducedMotion="user"` turns off transforms when the OS asks for reduced motion. The CSS keyframes (`mos-drift`, `mos-flow`, `mos-shimmer`) stop under `prefers-reduced-motion`, and the typewriter shows the full answer at once.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `Card` | `components/ui/card.tsx` | Glass card with title, icon, action slot, and `tour` id |
| `KpiCard` | `components/ui/kpi-card.tsx` | Value, delta, target, sparkline, source and freshness |
| `Badge`, `Delta`, `StatusDot` | `components/ui/badges.tsx` | `Delta` takes `goodWhenUp` so a falling cost shows green |
| `DemoButton`, `Segmented` | `components/ui/buttons.tsx` | Segmented is a `tablist`; each option is a `tab` button with `aria-selected` |
| `AnimatedNumber` | `components/ui/animated-number.tsx` | Screen readers get the final value only |
| `PageHeader` | `components/ui/page-header.tsx` | Title, description, actions |
| Charts | `components/charts.tsx` | `Sparkline`, `TrendArea`, `Donut`, `BarLine`, `MiniLine`, glass tooltip |
| Visuals | `components/viz.tsx` | `Funnel`, `CohortHeatmap`, `ScoreRing`, `InlineBar` |
| `WorkflowCanvas` | `components/workflow-canvas.tsx` | SVG edges with HTML nodes; node states idle, running, done, waiting |
| `ConnectorMark` | `components/connector-tile.tsx` | Neutral monogram tiles, not brand logos |
| Toasts | `components/toast.tsx` | `aria-live="polite"`, 3.8 s |

Icons come from `lucide-react` with one stroke width. Icons next to text are `aria-hidden`.

## Accessibility

- Text meets 4.5:1 contrast in both themes. Status is never shown by colour alone; badges carry a word ("Healthy", "Delayed").
- Every control is a real `button`, `a`, or `input`. Toggles use `role="switch"` with `aria-checked`. Sortable headers set `aria-sort`.
- Focus is visible everywhere (`.focus-ring`). The tour card is a `dialog` labelled by its title and works with Esc, ← and →.
- The tour spotlight does not block the page, so the presenter can click the highlighted element during the tour.
- Charts have a text summary next to them (the KPI or the legend), so the numbers are available without the chart.
