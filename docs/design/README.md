# Investor demo

An interactive mockup of Marketing OS that runs on fixed demo data. Use it in investor meetings and for design reviews. It is part of the web app, but it never calls the API or Supabase and it needs no login.

![Cockpit, dark theme](screenshots/cockpit-dark.png)

| Document | What it covers |
| --- | --- |
| [design-system.md](design-system.md) | Colour, type, motion, components, accessibility |
| [screens.md](screens.md) | Every screen: purpose, PRD area, interactions, screenshot |
| [demo-script.md](demo-script.md) | The 12-step investor walkthrough with talking points |
| [concepts/](concepts) | The four concept images approved before the build |
| [ADR-0022](../adr/0022-investor-demo-route.md) | Why the demo lives at `/demo` and which libraries it uses |

## Run it

```bash
pnpm install
pnpm --filter @marketing-os/web dev
```

Open <http://localhost:3000/demo>. Press **Start the investor tour** for the guided walkthrough, or **Explore freely**.

Every screen has a light/dark toggle in the top bar. Dark is the default. The choice is saved in `localStorage` under `mos-demo-theme`.

## Routes

| Route | Screen |
| --- | --- |
| `/demo` | Landing page |
| `/demo/onboarding` | Onboarding wizard |
| `/demo/cockpit` | Cockpit |
| `/demo/ask` | Ask Marketing |
| `/demo/performance` | Performance module |
| `/demo/organic` | Organic module |
| `/demo/retention` | Retention module |
| `/demo/automations` | Automations |
| `/demo/approvals` | Approvals |
| `/demo/integrations` | Integrations and data health |
| `/demo/console` | Specialist console |

All pages under `/demo` set `robots: noindex`.

## Demo data

The demo company is **Acme Cloud**, a fictional B2B SaaS company. All amounts are in EUR. The user is Lena Hoffmann, VP Marketing. Every page footer says "Fictional company. All figures are demo data."

Data is deterministic: time series use a seeded random generator (`mulberry32`) anchored to `DEMO_TODAY` (2026-11-10 UTC). The same numbers appear at every load and in every screenshot.

To change a number or a story, edit the files in `apps/web/src/demo/data/`. Nothing else reads these files.

## File map

```
apps/web/
  postcss.config.mjs           Tailwind v4 PostCSS plugin
  src/app/demo/
    demo.css                   Tokens, themes, utilities, keyframes (scoped to .mos)
    layout.tsx                 Fonts, metadata, DemoProviders
    page.tsx                   Landing
    onboarding/page.tsx        Onboarding wizard
    (shell)/layout.tsx         Sidebar + top bar shell
    (shell)/<screen>/page.tsx  One file per app screen
  src/demo/
    data/                      Demo data (company, cockpit, ask, modules, operate, console)
    lib/                       format.ts (EUR, compact numbers), series.ts (seeded series)
    tour/                      Tour steps, reducer, provider, spotlight overlay
    ask/                       Question matcher, typewriter, answer card, evidence panel
    components/                Theme, toast, charts, viz, workflow canvas, shell, ui/
e2e/demo/
  screenshots.mjs              Captures every screen into docs/design/screenshots
  tour-smoke.mjs               Clicks through the full tour and fails on errors
```

## Tests and checks

```bash
cd apps/web
npx vitest run src/demo       # formatters, series, tour reducer, question matcher
npx tsc -p tsconfig.json --noEmit
npx eslint src/demo src/app/demo
```

The browser scripts need a running dev server and the Playwright Chromium build:

```bash
DEMO_BASE_URL=http://localhost:3000 pnpm --filter @marketing-os/e2e demo:tour
DEMO_BASE_URL=http://localhost:3000 TOUR_SHOTS=1 pnpm --filter @marketing-os/e2e demo:tour   # also saves screenshots/tour/
DEMO_BASE_URL=http://localhost:3000 pnpm --filter @marketing-os/e2e demo:screenshots
```

`demo:screenshots` writes full-page captures at 1440×900 and 2× scale: every screen in dark, and landing, cockpit and Ask Marketing in light. In those captures the sidebar ends at the first viewport height because it is sticky; in a browser it stays pinned.

## Limits

- No real data, auth, or API calls. Buttons change local state only and reset on reload.
- Ask Marketing answers four scripted questions. Other questions get a short reply that lists them.
- The layout is built for a laptop or a projector. It works on a phone (the sidebar becomes a drawer) but was not designed for one.
- Connector tiles use neutral monograms, not brand logos.

## Provenance

The demo was designed and built with an AI assistant (Cursor, using the `ui-ux-pro-max` skill for the design system) on 2026-11-11. Concept images were reviewed before coding; the owner chose the theme, route, screens, dependencies, data set and the guided tour.
