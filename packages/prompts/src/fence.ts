const FENCE_MARK = "<<<";

/** Replace the fence mark so untrusted text cannot close the data block. */
function escapeFence(value: string): string {
  return value.replaceAll(FENCE_MARK, "‹‹‹");
}

function fenceName(name: string): string {
  const safe = name.replace(/[^a-z0-9_.-]/gi, "_");
  if (!safe) throw new Error("Fence name is empty");
  return safe;
}

/** Wrap one value so a model can see it as data, not as an instruction. */
export function fenceData(name: string, value: string): string {
  const label = fenceName(name);
  return `<<<DATA ${label}>>>\n${escapeFence(value)}\n<<<END ${label}>>>`;
}

export function fenceRecord(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((key) => fenceData(key, values[key] ?? ""))
    .join("\n\n");
}
