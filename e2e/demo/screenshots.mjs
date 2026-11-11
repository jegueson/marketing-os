// Captures every /demo screen for docs/design/screenshots and investor decks.
// Usage: start the web app, then `pnpm --filter @marketing-os/e2e demo:screenshots`.
// Env: DEMO_BASE_URL (default http://localhost:3000).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/design/screenshots");
const SETTLE_MS = 2600;

const SCREENS = [
  ["landing", "/demo"],
  ["onboarding", "/demo/onboarding"],
  ["cockpit", "/demo/cockpit"],
  ["ask-marketing", "/demo/ask"],
  ["performance", "/demo/performance"],
  ["organic", "/demo/organic"],
  ["retention", "/demo/retention"],
  ["automations", "/demo/automations"],
  ["approvals", "/demo/approvals"],
  ["integrations", "/demo/integrations"],
  ["console", "/demo/console"],
];

async function capture(page, name, route, theme) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  // Hide the Next.js dev badge and scroll once so in-view animations have played.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(SETTLE_MS);
  const file = path.join(OUT, `${name}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${path.relative(process.cwd(), file)}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      await context.addInitScript((value) => window.localStorage.setItem("mos-demo-theme", value), theme);
      const page = await context.newPage();
      page.on("pageerror", (err) => console.error(`[${theme}] page error:`, err.message));
      const screens = theme === "dark" ? SCREENS : SCREENS.filter(([name]) => ["landing", "cockpit", "ask-marketing"].includes(name));
      for (const [name, route] of screens) await capture(page, name, route, theme);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exitCode = 1;
});
