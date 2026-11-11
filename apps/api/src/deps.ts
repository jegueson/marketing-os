import {
  CloudflareEmailSender,
  InMemoryEmailSender,
  MailpitEmailSender,
  type EmailSender,
} from "@marketing-os/core";
import { createDb, type DbHandle } from "@marketing-os/db";
import type { Connector } from "@marketing-os/connector-sdk";
import { mockConnector } from "@marketing-os/connector-mock";
import type { AppEnv } from "./env";
import type { OAuthProvider } from "./lib/mock-oauth";
import { createMockOAuthProvider } from "./lib/mock-oauth";
import { noopProvisioningHooks, type ProvisioningHooks } from "./services/provisioning";
import {
  BindingRateLimiter,
  DisabledCaptcha,
  MemoryRateLimiter,
  TurnstileVerifier,
  type CaptchaVerifier,
  type RateLimiter,
} from "./lib/abuse";

export type ConnectorRegistry = ReadonlyMap<string, Connector>;

/** Everything the API touches outside its own code. Tests replace these. */
export type AppDeps = {
  openDatabase: (env: AppEnv) => DbHandle;
  emailSender: (env: AppEnv, bindings: Env) => EmailSender;
  leadRateLimiter: (bindings: Env) => RateLimiter;
  captcha: (env: AppEnv) => CaptchaVerifier;
  connectors: ConnectorRegistry;
  oauthProviders: ReadonlyMap<string, OAuthProvider>;
  provisioningHooks: ProvisioningHooks;
};

const PUBLIC_LEADS_PER_MINUTE = 5;
const fallbackLimiter = new MemoryRateLimiter(PUBLIC_LEADS_PER_MINUTE, 60_000);
const devOutbox = new InMemoryEmailSender();

export const defaultDeps: AppDeps = {
  openDatabase: (env) => createDb(env.databaseUrl),
  emailSender: (env, bindings) => {
    if (bindings.EMAIL) return new CloudflareEmailSender(bindings.EMAIL, env.emailFrom);
    if (env.mailpitUrl) return new MailpitEmailSender(env.mailpitUrl, env.emailFrom);
    if (env.deploymentMode === "cloud") {
      throw new Error("Cloud mode requires the EMAIL binding or MAILPIT_URL");
    }
    return devOutbox;
  },
  leadRateLimiter: (bindings) =>
    bindings.PUBLIC_LEADS_RATE_LIMITER
      ? new BindingRateLimiter(bindings.PUBLIC_LEADS_RATE_LIMITER)
      : fallbackLimiter,
  captcha: (env) => {
    if (env.turnstileSecret) return new TurnstileVerifier(env.turnstileSecret);
    return new DisabledCaptcha(env.deploymentMode === "cloud" ? "not_configured" : "ok");
  },
  connectors: new Map<string, Connector>([["mock", mockConnector]]),
  oauthProviders: new Map<string, OAuthProvider>([["mock", createMockOAuthProvider()]]),
  provisioningHooks: noopProvisioningHooks,
};
