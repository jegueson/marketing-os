# Marketing OS brand guidelines

Canonical visual identity for the product (portal, console, and shared UI). The investor demo follows the same tokens.

## Brand essence

Marketing OS is a calm operating layer for specialists and customer teams. The brand feels precise, technical, and optimistic — dark structure with a cool secondary field and a sharp neon signal for action.

## Primary palette (ratio)

| Role | Name | RGB | Hex | Share |
| --- | --- | --- | --- | --- |
| Structure / field | Carbon Navy | `27, 33, 48` | `#1B2130` | **60%** |
| Support / air | Glacier Sage | `184, 199, 192` | `#B8C7C0` | **30%** |
| Signal / detail | Yuzu Neon | `232, 255, 42` | `#E8FF2A` | **10%** |

### How to spend the ratio

- **Carbon Navy (60%)**: page background, sidebar, dense chrome, primary text on light sage chips.
- **Glacier Sage (30%)**: secondary surfaces, muted copy, borders, icons at rest, table zebra hints.
- **Yuzu Neon (10%)**: primary CTAs, focus rings, active nav mark, key sparklines, success sparks. Never flood large fields with yuzu.

### Derived roles

| Token | Value | Use |
| --- | --- | --- |
| `--mos-fg` | `#F2F6F4` | Body and titles on carbon |
| `--mos-muted` | `#B8C7C0` | Secondary text (sage) |
| `--mos-surface` | sage glass on carbon | Panels that hold interaction |
| `--mos-on-accent` | `#1B2130` | Label text on yuzu buttons |
| Success / warning / danger | tinted sage–adjacent hues | Status only; always pair with a word |

Do not introduce a fourth brand hue without updating this doc. Status colours are functional, not brand.

## Typography

| Role | Face | Notes |
| --- | --- | --- |
| UI + headings | Plus Jakarta Sans | Loaded via `next/font` (self-hosted for CSP `font-src 'self'`) |
| Numbers / IDs / code | JetBrains Mono | Tabular figures for KPIs |

Weights: 400 body, 500 labels, 600 buttons / nav, 700 page titles. Tracking slightly tight on titles (`-0.02em`). Body 14–16px in product; 16–18px on marketing surfaces.

## Voice in UI

- Short verbs: Save, Test, Publish, Sign out.
- Prefer plain nouns over marketing fluff in product chrome.
- Errors name the fix, not the stack.

## Logo lockup

Wordmark **Marketing OS** in Plus Jakarta Sans 700. Optional yuzu underline or leading mark (2×2 yuzu square) at 10% accent budget. Do not place the wordmark on yuzu fills except for temporary splash states.

## Do / Don't

**Do**

- Keep carbon as the default product field (dark-first brand).
- Put yuzu only on the one action that matters per view.
- Keep focus rings yuzu at 2px with offset.

**Don't**

- Purple or indigo as brand colour.
- Cream paper + terracotta accent themes.
- Flat grey SaaS defaults that ignore sage and yuzu.
- Neon backgrounds larger than a button or badge.
- Emoji as chrome icons — use Lucide (or Phosphor) vectors.

## Accessibility

- Body text on carbon uses `--mos-fg` (≥4.5:1).
- Secondary text uses lifted sage `--mos-muted` (`#C5D4CD`) for ≥4.5:1 on carbon.
- **Text on yuzu CTAs must be near-black `--mos-ink` (`#07090E`), never white.** White on yuzu is ~1.1:1.
- Primary buttons set `-webkit-font-smoothing: auto` so neon does not wash the ink.
- Focus on yuzu buttons uses a light outline + carbon halo (yuzu-on-yuzu fails).
- Colour is never the only status or nav signal (underline, inset bar, words).
- Hit targets ≥44px (`--mos-target`). Skip link present on shells.
- Honour `prefers-reduced-motion` for ambient glow and transitions.

## Source of truth

- Tokens and utilities: `apps/web/src/styles/brand.css`
- Architecture: [architecture.md](./architecture.md)
- Component mapping: [design-system.md](./design-system.md)
