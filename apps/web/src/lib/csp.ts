/**
 * Per-request Content-Security-Policy.
 * Scripts use a nonce plus strict-dynamic so Next.js inline scripts can run.
 * Styles stay on 'unsafe-inline' (a nonce would disable that keyword).
 * Turnstile needs script, frame, and connect access to challenges.cloudflare.com.
 */

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export type CspInput = {
  nonce: string;
  /** React dev mode uses eval. Omit in production. */
  dev?: boolean;
  /** Browser calls these origins (API, Supabase). Invalid URLs are ignored. */
  connectUrls?: string[];
  /** Set upgrade-insecure-requests only on https pages. */
  https?: boolean;
};

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function originOf(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function socketOrigin(origin: string): string | null {
  if (origin.startsWith("https://")) return `wss://${origin.slice("https://".length)}`;
  if (origin.startsWith("http://")) return `ws://${origin.slice("http://".length)}`;
  return null;
}

export function contentSecurityPolicy(input: CspInput): string {
  const connect = new Set<string>(["'self'", TURNSTILE_ORIGIN]);
  for (const raw of input.connectUrls ?? []) {
    const origin = originOf(raw);
    if (!origin) continue;
    connect.add(origin);
    const socket = socketOrigin(origin);
    if (socket) connect.add(socket);
  }

  const script = [
    "'self'",
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    TURNSTILE_ORIGIN,
    input.dev ? "'unsafe-eval'" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const directives = [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${TURNSTILE_ORIGIN}`,
    "font-src 'self'",
    `connect-src ${[...connect].join(" ")}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    input.https ? "upgrade-insecure-requests" : null,
  ].filter((part): part is string => Boolean(part));

  return directives.join("; ");
}

/** True when a Turnstile script and iframe are allowed by this policy. */
export function cspAllowsTurnstile(policy: string): boolean {
  const script = directive(policy, "script-src");
  const frame = directive(policy, "frame-src");
  return (
    script.includes(TURNSTILE_ORIGIN) &&
    script.includes("'strict-dynamic'") &&
    /'nonce-[^']+'/.test(script) &&
    frame.includes(TURNSTILE_ORIGIN)
  );
}

function directive(policy: string, name: string): string {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return found ?? "";
}
