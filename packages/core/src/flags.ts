export type FlagContext = {
  tenantOverrides?: Record<string, boolean>;
  platformDefaults?: Record<string, boolean>;
};

export function isEnabled(flag: string, ctx: FlagContext = {}): boolean {
  if (ctx.tenantOverrides && flag in ctx.tenantOverrides) {
    return Boolean(ctx.tenantOverrides[flag]);
  }
  if (ctx.platformDefaults && flag in ctx.platformDefaults) {
    return Boolean(ctx.platformDefaults[flag]);
  }
  return false;
}
