#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@marketing-os/db";
import { SupabaseAuthAdmin } from "./auth-admin";
import { deployPlan, runDeploy } from "./deploy";
import { runSetup } from "./setup";

const USAGE = `Usage:
  mos setup --email=<admin email> [--tenant="Local Team"] [--slug=local] [--mode=self_hosted] [--provider=openrouter] [--force]
  mos deploy [--dry-run]

setup reads secrets from the environment, never from arguments:
  DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MOS_DATA_KEY,
  MOS_ADMIN_PASSWORD, MOS_MODEL_API_KEY`;

function parseArgs(parts: string[]): Record<string, string> {
  return Object.fromEntries(
    parts.map((part) => {
      const [k, ...v] = part.replace(/^--/, "").split("=");
      return [k, v.join("=") || "true"];
    }),
  ) as Record<string, string>;
}

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((name) => [name, process.env[name]!]));
}

async function setup(args: Record<string, string>) {
  const env = requireEnv([
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MOS_DATA_KEY",
    "MOS_ADMIN_PASSWORD",
    "MOS_MODEL_API_KEY",
  ]);
  const handle = createDb(env.DATABASE_URL!);
  try {
    const result = await runSetup(
      process.cwd(),
      {
        deploymentMode: args.mode ?? "self_hosted",
        adminEmail: args.email ?? "",
        adminPassword: env.MOS_ADMIN_PASSWORD!,
        tenantName: args.tenant ?? "Local Team",
        tenantSlug: args.slug ?? "local",
        modelProvider: (args.provider ?? "openrouter") as "openrouter",
        modelApiKey: env.MOS_MODEL_API_KEY!,
        force: args.force === "true",
      },
      {
        db: handle.db,
        auth: new SupabaseAuthAdmin(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
        dataKey: env.MOS_DATA_KEY!,
      },
    );
    console.log(
      JSON.stringify(
        {
          ...result,
          next: [
            "Set the same MOS_DATA_KEY on the API (apps/api/.dev.vars or wrangler secret put MOS_DATA_KEY)",
            "pnpm dev",
            `Sign in at http://127.0.0.1:3000/login as ${result.adminEmail}`,
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await handle.close();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === "setup") return setup(args);
  if (cmd === "deploy") {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    return runDeploy(deployPlan(repoRoot), args["dry-run"] === "true");
  }
  console.error(USAGE);
  process.exitCode = 1;
}

main().catch((err: Error) => {
  console.error(`${err.name}: ${err.message}`);
  process.exitCode = 1;
});
