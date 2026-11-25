# Design architecture

How brand tokens become product UI without forking a second visual language for the demo.

## Layers

```
Brand guidelines          docs/design/brand-guidelines.md
        │
Token CSS                 apps/web/src/styles/brand.css   (.mos root)
        │
┌───────┴────────┐
│ App chrome     │  AppShell / PortalFrame / console nav
│ UI primitives  │  @marketing-os/ui (class hooks: mos-btn, mos-input, …)
│ Feature CSS    │  e.g. customer-config.module.css → consume brand vars
│ Demo shell     │  apps/web/src/app/demo/demo.css maps Tailwind → same vars
└────────────────┘
```

1. **Guidelines** fix the 60 / 30 / 10 palette and typography.
2. **Token CSS** defines semantic variables (`--mos-bg`, `--mos-accent`, …) and layout utilities (`.glass`, `.app-shell`, …).
3. **App chrome** (`AppShell`) applies the demo-like sidebar + main pattern to portal and console.
4. **Primitives** stay logic-only; presentation comes from brand CSS class names so Workers/CSP stay simple.
5. **Demo** keeps Tailwind utilities but remaps `@theme` colours to the same carbon / sage / yuzu tokens.

## Surfaces

| Surface | Route prefix | Shell |
| --- | --- | --- |
| Customer portal | `/portal` | `PortalFrame` → `AppShell` |
| Specialist console | `/console` | `ConsoleFrame` → `AppShell` |
| Public / auth | `/`, `/get-started`, `/sign-in` | Lightweight `.mos` page, no sidebar |
| Investor demo | `/demo` | Existing `DemoShell` + brand tokens |

## Density and motion

- Product density: 8px grid, compact nav, 16–24px panel padding (ui-ux-pro-max density dial ~7).
- Motion: short opacity/transform reveals (≤400ms). Ambient sage/yuzu glow is decorative and disabled under reduced motion.
- Cards exist only when they bound an interaction (form, list row, runnable config). Decorative card stacks are avoided on first-load heroes.

## Ownership

| Change | Owner file |
| --- | --- |
| Hex / RGB brand shift | `brand-guidelines.md` + `brand.css` + demo dark/light maps |
| New shell pattern | `components/app-shell.tsx` |
| New primitive look | `packages/ui` className + `brand.css` rules |
| Feature-local layout | colocated `*.module.css` using `var(--mos-*)` only |

## Anti-drift

- No hard-coded `#3b82f6` / purple in new product CSS.
- Feature modules must not redefine a private palette when a `--mos-*` token exists.
- Before shipping UI, check contrast of fg/muted/accent against carbon and of on-accent against yuzu.
