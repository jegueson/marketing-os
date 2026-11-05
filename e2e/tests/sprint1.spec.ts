/**
 * Browser journey against a running local stack:
 *   supabase start, `wrangler dev` (apps/api), `next dev` (apps/web).
 * Needs E2E_BASE_URL, E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY and E2E_MAILPIT_URL.
 * See docs/self-hosting.md "End-to-end tests".
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const supabaseUrl = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const mailpitUrl = process.env.E2E_MAILPIT_URL;
const password = "e2e-Password-123";

test.skip(
  !process.env.E2E_BASE_URL || !supabaseUrl || !serviceKey || !mailpitUrl,
  "Set E2E_BASE_URL, E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY and E2E_MAILPIT_URL",
);

async function createStaffUser(email: string): Promise<void> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey!, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { mos_staff_role: "success_manager" } }),
  });
  if (!res.ok) throw new Error(`staff user create failed: ${res.status} ${await res.text()}`);
}

async function inviteLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      const match = message.Text.match(/https?:\/\/\S+\/invite\/[a-f0-9]+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no invitation email for ${to}`);
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function connectMockAndCheckCockpit(page: Page) {
  await page.getByRole("link", { name: "Integrations" }).click();
  await page.getByRole("button", { name: "Connect" }).first().click();
  await page.getByLabel(/Demo Ads Account/).check();
  await page.getByRole("button", { name: "Step 3: save and test connection" }).click();
  await expect(page.getByText(/: active, 1 resources selected/)).toBeVisible();
  await page.getByRole("link", { name: "Cockpit" }).click();
  await expect(page.getByText(/data live/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "healthy" })).toBeVisible();
}

test("setup wizard install: admin signs in, connects mock and sees the cockpit", async ({ page }) => {
  test.skip(!process.env.E2E_DATABASE_URL, "Set E2E_DATABASE_URL to run the setup wizard journey");
  const run = Date.now();
  const email = `admin+${run}@e2e.test`;
  const setup = spawnSync(
    "pnpm",
    ["--filter", "@marketing-os/cli", "exec", "tsx", "src/bin.ts", "setup", `--email=${email}`, `--slug=e2e-${run}`, "--tenant=E2E Install"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        MOS_DATA_KEY: randomBytes(32).toString("base64"),
        MOS_ADMIN_PASSWORD: password,
        MOS_MODEL_API_KEY: "sk-or-v1-e2e-not-a-real-key",
      },
    },
  );
  expect(setup.status, setup.stderr).toBe(0);
  expect(setup.stdout).not.toContain("sk-or-v1-e2e");

  await signIn(page, email, "/portal");
  await expect(page.getByRole("heading", { name: "Customer portal" })).toBeVisible();
  await expect(page.getByText("E2E Install · Default")).toBeVisible();
  await connectMockAndCheckCockpit(page);
});

test("visitor lead becomes a customer who connects a source and sees the cockpit", async ({ browser }) => {
  const run = Date.now();
  const company = `E2E Co ${run}`;
  const customerEmail = `owner+${run}@e2e.test`;
  const staffEmail = `sm+${run}@e2e.test`;
  await createStaffUser(staffEmail);

  const visitor = await browser.newPage();
  await visitor.goto("/get-started");
  await visitor.getByLabel("Company").fill(company);
  await visitor.getByLabel("Contact name").fill("Erin");
  await visitor.getByLabel("Work email").fill(customerEmail);
  await visitor.getByLabel("How can we help?").selectOption("cloud_workspace");
  await visitor.getByRole("button", { name: "Submit" }).click();
  await expect(visitor.getByRole("heading", { name: "Thanks" })).toBeVisible();

  const staff = await (await browser.newContext()).newPage();
  await signIn(staff, staffEmail, `/console/leads`);
  await expect(staff.getByRole("heading", { name: "Leads" })).toBeVisible();
  await staff.getByRole("link", { name: company }).click();
  for (const status of ["contacted", "discovery", "qualified"]) {
    await staff.getByRole("button", { name: `Move to ${status}` }).click();
    await expect(staff.getByText(`Status: ${status}`)).toBeVisible();
  }
  await staff.getByRole("button", { name: "Convert to customer" }).click();
  await expect(staff.getByText(/Customer created\. Invitation to .* sent\./)).toBeVisible();

  const link = await inviteLink(customerEmail);
  const customer = await (await browser.newContext()).newPage();
  await customer.goto(new URL(link).pathname);
  await customer.waitForURL(/\/login\?next=/);
  await customer.getByRole("button", { name: "New here? Create an account" }).click();
  await customer.getByLabel("Email").fill(customerEmail);
  await customer.getByLabel("Password").fill(password);
  await customer.getByRole("button", { name: "Create account" }).click();
  await expect(customer.getByText("You joined the workspace.")).toBeVisible();
  await customer.getByRole("link", { name: "Continue to onboarding" }).click();
  await expect(customer.getByRole("heading", { name: "Onboarding" })).toBeVisible();

  await connectMockAndCheckCockpit(customer);
});
