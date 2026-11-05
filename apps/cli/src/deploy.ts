import { spawnSync } from "node:child_process";
import path from "node:path";

export type DeployStep = { label: string; cwd: string; command: string; args: string[] };

export class DeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployError";
  }
}

/**
 * Deploys both Workers to the Cloudflare account wrangler is logged in to.
 * Migrations go first so the API never runs against an older schema.
 */
export function deployPlan(repoRoot: string): DeployStep[] {
  return [
    { label: "Check Cloudflare login", cwd: repoRoot, command: "pnpm", args: ["--filter", "@marketing-os/api", "exec", "wrangler", "whoami"] },
    { label: "Apply database migrations", cwd: repoRoot, command: "supabase", args: ["db", "push"] },
    { label: "Deploy API Worker", cwd: path.join(repoRoot, "apps/api"), command: "pnpm", args: ["exec", "wrangler", "deploy"] },
    { label: "Deploy web Worker", cwd: path.join(repoRoot, "apps/web"), command: "pnpm", args: ["run", "deploy"] },
  ];
}

export function runDeploy(steps: DeployStep[], dryRun: boolean): void {
  for (const step of steps) {
    console.log(`→ ${step.label}: ${step.command} ${step.args.join(" ")}`);
    if (dryRun) continue;
    const result = spawnSync(step.command, step.args, { cwd: step.cwd, stdio: "inherit" });
    if (result.error) throw new DeployError(`${step.label} could not start: ${result.error.message}`);
    if (result.status !== 0) throw new DeployError(`${step.label} failed with exit code ${result.status}`);
  }
}
