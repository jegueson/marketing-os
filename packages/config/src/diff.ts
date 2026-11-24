export type ConfigDiffChange = {
  path: string;
  before: unknown;
  after: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function walk(before: unknown, after: unknown, path: string, changes: ConfigDiffChange[]): void {
  if (Object.is(before, after)) return;
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ path: path || "(root)", before, after });
    }
    return;
  }
  if (!isObject(before) || !isObject(after)) {
    changes.push({ path: path || "(root)", before, after });
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in before)) {
      changes.push({ path: next, before: undefined, after: after[key] });
      continue;
    }
    if (!(key in after)) {
      changes.push({ path: next, before: before[key], after: undefined });
      continue;
    }
    walk(before[key], after[key], next, changes);
  }
}

/** Structural diff for specialist config documents. Order of object keys is ignored. */
export function diffConfigDocuments(active: unknown | null, proposed: unknown): ConfigDiffChange[] {
  const changes: ConfigDiffChange[] = [];
  walk(active, proposed, "", changes);
  return changes;
}
