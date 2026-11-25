export type FlagContext = {
  tenantOverrides?: Record<string, boolean>;
  platformDefaults?: Record<string, boolean>;
};

/** Platform flag keys seeded in migrations. Unknown keys stay off. */
export const knownFlags = [
  "cockpit.performance",
  "cockpit.leads",
  "module.brand",
  "connector.google-analytics",
  "connector.google-ads",
  "connector.meta",
  "connector.hubspot",
  "connector.linear",
  "connector.notion",
  "connector.rest",
  "ask_marketing",
  "specialist_config",
  "managed_work",
] as const;

export type KnownFlag = (typeof knownFlags)[number];

const platformDefaults: Record<KnownFlag, boolean> = {
  "cockpit.performance": true,
  "cockpit.leads": true,
  "module.brand": false,
  "connector.google-analytics": false,
  "connector.google-ads": false,
  "connector.meta": false,
  "connector.hubspot": false,
  "connector.linear": false,
  "connector.notion": false,
  "connector.rest": false,
  ask_marketing: false,
  specialist_config: false,
  managed_work: false,
};

/** Seeded platform default for a known flag. Unknown keys are false. */
export function platformFlagDefault(flag: string): boolean {
  if ((knownFlags as readonly string[]).includes(flag)) {
    return platformDefaults[flag as KnownFlag];
  }
  return false;
}

export function isEnabled(flag: string, ctx: FlagContext = {}): boolean {
  if (ctx.tenantOverrides && flag in ctx.tenantOverrides) {
    return Boolean(ctx.tenantOverrides[flag]);
  }
  if (ctx.platformDefaults && flag in ctx.platformDefaults) {
    return Boolean(ctx.platformDefaults[flag]);
  }
  return false;
}
