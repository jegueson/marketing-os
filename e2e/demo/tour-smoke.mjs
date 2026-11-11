// Walks the full investor tour and fails if a step has no target or a page throws.
// Usage: start the web app, then `pnpm --filter @marketing-os/e2e demo:tour`.
// Set TOUR_SHOTS=1 to also save one screenshot per step to docs/design/screenshots/tour.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const SHOTS_DIR =
  process.env.TOUR_SHOTS === "1"
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/design/screenshots/tour")
    : null;

async function main() {
  if (SHOTS_DIR) await mkdir(SHOTS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    const hide = () => document.head?.insertAdjacentHTML("beforeend", "<style>nextjs-portal{display:none!important}</style>");
    document.addEventListener("DOMContentLoaded", hide);
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "warning" && msg.text().startsWith("Tour target not found")) errors.push(msg.text());
  });

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start the investor tour" }).click();

    for (let step = 1; ; step += 1) {
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 15_000 });
      const title = await dialog.locator("#tour-title").innerText();
      console.log(`step ${step}: ${new URL(page.url()).pathname} · ${title}`);
      const next = dialog.getByRole("button", { name: /Next|Finish/ });
      const finishing = (await next.innerText()).includes("Finish");
      await page.waitForTimeout(900);
      if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, `tour-${String(step).padStart(2, "0")}.png`) });
      await next.click();
      if (finishing) break;
    }

    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5_000 });
    if (errors.length) throw new Error(`Tour problems:\n${errors.join("\n")}`);
    console.log("tour ok");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Tour smoke test failed:", err);
  process.exitCode = 1;
});
