export interface RateLimiter {
  /** Returns false when the key is over its limit. */
  allow(key: string): Promise<boolean>;
}

export interface CaptchaVerifier {
  verify(token: string | undefined, remoteIp: string | null): Promise<CaptchaResult>;
}

export type CaptchaResult = "ok" | "failed" | "not_configured";

/** Workers Rate Limiting binding (approximate, per Cloudflare location). */
export class BindingRateLimiter implements RateLimiter {
  constructor(private readonly binding: RateLimit) {}

  async allow(key: string): Promise<boolean> {
    const { success } = await this.binding.limit({ key });
    return success;
  }
}

/** Fixed-window limiter for self-hosted dev without the binding. Per isolate only. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async allow(key: string): Promise<boolean> {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      return this.limit >= 1;
    }
    const next = { windowStart: entry.windowStart, count: entry.count + 1 };
    this.hits.set(key, next);
    return next.count <= this.limit;
  }
}

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class TurnstileVerifier implements CaptchaVerifier {
  constructor(
    private readonly secret: string,
    // Wrapped: Workers throws "Illegal invocation" when global fetch is called as a method.
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async verify(token: string | undefined, remoteIp: string | null): Promise<CaptchaResult> {
    if (!token) return "failed";
    const body = new FormData();
    body.append("secret", this.secret);
    body.append("response", token);
    if (remoteIp) body.append("remoteip", remoteIp);
    const res = await this.fetchImpl(TURNSTILE_URL, { method: "POST", body });
    if (!res.ok) return "failed";
    const outcome = (await res.json()) as { success?: boolean };
    return outcome.success === true ? "ok" : "failed";
  }
}

/** Self-hosted installs may run without Turnstile. Cloud mode must not. */
export class DisabledCaptcha implements CaptchaVerifier {
  constructor(private readonly result: CaptchaResult) {}

  async verify(): Promise<CaptchaResult> {
    return this.result;
  }
}
