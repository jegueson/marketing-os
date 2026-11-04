#!/usr/bin/env node
import { runSetup } from "./setup";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "setup") {
    const args = Object.fromEntries(
      rest.map((part) => {
        const [k, ...v] = part.replace(/^--/, "").split("=");
        return [k, v.join("=") || "true"];
      }),
    ) as Record<string, string>;
    const result = await runSetup(process.cwd(), {
      deploymentMode: args.mode ?? "self_hosted",
      adminEmail: args.email ?? "",
      tenantName: args.tenant ?? "Local Team",
      tenantSlug: args.slug ?? "local",
      modelProvider: (args.provider as "openrouter") ?? "openrouter",
      modelApiKey: args["model-key"] ?? "",
      force: args.force === "true",
    });
    console.log(
      JSON.stringify(
        {
          created: result.created,
          adminEmail: result.adminEmail,
          tenantSlug: result.tenantSlug,
          deploymentMode: result.deploymentMode,
          modelProvider: result.modelProvider,
          modelKeyFingerprint: result.modelKeyFingerprint,
          next: ["pnpm dev", "Open http://127.0.0.1:3000"],
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "deploy") {
    console.log(
      JSON.stringify({
        message: "Run wrangler deploy for apps/api and apps/web after configuring Hyperdrive, Queues, and R2.",
        docs: "docs/self-hosting.md",
      }),
    );
    return;
  }

  console.error("Usage: mos <setup|deploy>");
  process.exitCode = 1;
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
