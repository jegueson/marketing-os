import { ModelGatewayError } from "./errors";

export type DeploymentMode = "cloud" | "self_hosted";

export type EndpointGuardOptions = {
  deploymentMode: DeploymentMode;
  /** Self-host only: allow private/loopback HTTP endpoints (Ollama, LM Studio). */
  allowPrivateEndpoints?: boolean;
};

const BLOCKED_HOSTNAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isLoopbackIp(octets: number[]): boolean {
  return octets[0] === 127;
}

function isPrivateIpv4(octets: number[]): boolean {
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 169 && octets[1] === 254) return true; // link-local / cloud metadata
  if (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127) return true; // CGNAT
  if (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) return true;
  if (octets[0] === 0) return true;
  return false;
}

function expandIpv6(host: string): number[] | null {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(":")) return null;

  // IPv4-mapped / compatible dotted tail: ::ffff:127.0.0.1 or ::127.0.0.1
  const dotted = h.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = parseIpv4(dotted[2]!);
    if (!octets) return null;
    const head = dotted[1]!.replace(/:$/, "");
    const hexTail = octets.map((n) => n.toString(16).padStart(2, "0"));
    const rebuilt = `${head}:${hexTail[0]}${hexTail[1]}:${hexTail[2]}${hexTail[3]}`;
    return expandIpv6(rebuilt);
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean) : [];
  if (halves.length === 1) {
    if (left.length !== 8) return null;
  } else if (left.length + right.length > 8) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array(Math.max(missing, 0)).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const values: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    values.push(Number.parseInt(g, 16));
  }
  return values;
}

function embeddedIpv4FromIpv6(groups: number[]): number[] | null {
  // ::ffff:x:y  or  ::x:y (IPv4-compatible, deprecated)
  const isMapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  const isCompatible =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0 &&
    !(groups[6] === 0 && groups[7] === 1); // exclude ::1
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b;
  if (!isMapped && !isCompatible && !isNat64) return null;
  const hi = groups[6]!;
  const lo = groups[7]!;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

function isBlockedIpv6(host: string): boolean {
  const groups = expandIpv6(host);
  if (!groups) return true; // unparseable IPv6 → refuse
  // ::1 loopback
  if (groups.every((g, i) => (i === 7 ? g === 1 : g === 0))) return true;
  // :: unspecified
  if (groups.every((g) => g === 0)) return true;
  // fe80::/10 link-local
  if ((groups[0]! & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique local
  if ((groups[0]! & 0xfe00) === 0xfc00) return true;
  const embedded = embeddedIpv4FromIpv6(groups);
  if (embedded && (isLoopbackIp(embedded) || isPrivateIpv4(embedded))) return true;
  return false;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.includes(":")) return isBlockedIpv6(host);
  const octets = parseIpv4(host);
  if (octets) return isLoopbackIp(octets) || isPrivateIpv4(octets);
  return false;
}

function isMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  const octets = parseIpv4(host);
  if (octets && octets[0] === 169 && octets[1] === 254) return true;
  if (host.includes(":")) {
    const groups = expandIpv6(host);
    if (!groups) return true;
    const embedded = embeddedIpv4FromIpv6(groups);
    if (embedded && embedded[0] === 169 && embedded[1] === 254) return true;
  }
  return false;
}

/**
 * Validate a model provider base URL before any network call.
 * Cloud: https only, no private/loopback/metadata.
 * Self-host: private/loopback HTTP allowed only with allowPrivateEndpoints.
 *
 * Note: this is a hostname/literal check only. DNS names that resolve to
 * private IPs are not detected without a resolver.
 */
export function assertSafeModelEndpoint(rawUrl: string, options: EndpointGuardOptions): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ModelGatewayError("Model endpoint URL is invalid", "invalid_request");
  }

  if (url.username || url.password) {
    throw new ModelGatewayError("Model endpoint must not include credentials", "invalid_request");
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new ModelGatewayError("Model endpoint must be http or https", "invalid_request");
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    throw new ModelGatewayError("Model endpoint host is required", "invalid_request");
  }

  if (isMetadataHost(host)) {
    throw new ModelGatewayError("Model endpoint host is blocked", "invalid_request");
  }

  const privateHost = isPrivateOrLoopbackHost(host);
  const allowPrivate = options.deploymentMode === "self_hosted" && options.allowPrivateEndpoints === true;

  if (options.deploymentMode === "cloud") {
    if (protocol !== "https:") {
      throw new ModelGatewayError("Cloud model endpoints must use https", "invalid_request");
    }
    if (privateHost) {
      throw new ModelGatewayError("Cloud model endpoints cannot target private hosts", "invalid_request");
    }
    return url;
  }

  if (privateHost) {
    if (!allowPrivate) {
      throw new ModelGatewayError(
        "Private model endpoints require MOS_MODEL_ALLOW_PRIVATE_ENDPOINTS=1",
        "invalid_request",
      );
    }
    return url;
  }

  return url;
}

/**
 * Resolve and validate a redirect Location against the same guard.
 * Cross-origin redirects are refused so Authorization is never forwarded.
 */
export function assertSafeRedirect(
  location: string,
  base: URL,
  options: EndpointGuardOptions,
): URL {
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    throw new ModelGatewayError("Redirect location is invalid", "invalid_request");
  }
  if (next.origin !== base.origin) {
    throw new ModelGatewayError("Cross-origin model redirects are not allowed", "invalid_request");
  }
  if (base.protocol === "https:" && next.protocol !== "https:") {
    throw new ModelGatewayError("HTTPS to HTTP redirect is not allowed", "invalid_request");
  }
  return assertSafeModelEndpoint(next.toString(), options);
}
