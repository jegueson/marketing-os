import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicGateway } from "./adapters/anthropic";
import { ANTHROPIC_CHAT_MODEL, ANTHROPIC_TEST_KEY } from "./adapters/anthropic.fixtures";
import { OpenAIGateway } from "./adapters/openai";
import { OPENAI_CHAT_MODEL, OPENAI_TEST_KEY } from "./adapters/openai.fixtures";
import { OpenAICompatibleGateway } from "./adapters/openai-compatible";
import { COMPAT_BASE_URL, COMPAT_CHAT_MODEL, COMPAT_TEST_KEY } from "./adapters/openai-compatible.fixtures";
import { OpenRouterGateway } from "./adapters/openrouter";
import { OPENROUTER_CHAT_MODEL, OPENROUTER_TEST_KEY } from "./adapters/openrouter.fixtures";
import { ModelGatewayError } from "./errors";
import { redactSecrets } from "./log";
import type { ModelGateway } from "./types";

const PROMPT = "quarterly pipeline narrative";

function failFetch(key: string): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        error: { message: `echo ${PROMPT} Bearer ${key} and ${key}` },
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
}

function capture() {
  const errors: string[] = [];
  const infos: string[] = [];
  const err = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  const info = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    infos.push(args.map(String).join(" "));
  });
  return {
    errors,
    infos,
    restore() {
      err.mockRestore();
      info.mockRestore();
    },
  };
}

const adapters: Array<{
  name: string;
  key: string;
  model: string;
  make: (mode: "cloud" | "self_hosted", modelDebug: boolean) => ModelGateway;
}> = [
  {
    name: "openrouter",
    key: OPENROUTER_TEST_KEY,
    model: OPENROUTER_CHAT_MODEL,
    make: (deploymentMode, modelDebug) =>
      new OpenRouterGateway({
        apiKey: OPENROUTER_TEST_KEY,
        fetch: failFetch(OPENROUTER_TEST_KEY),
        deploymentMode,
        modelDebug,
      }),
  },
  {
    name: "openai_compatible",
    key: COMPAT_TEST_KEY,
    model: COMPAT_CHAT_MODEL,
    make: (deploymentMode, modelDebug) =>
      new OpenAICompatibleGateway({
        apiKey: COMPAT_TEST_KEY,
        baseUrl: COMPAT_BASE_URL,
        fetch: failFetch(COMPAT_TEST_KEY),
        deploymentMode,
        allowPrivateEndpoints: true,
        modelDebug,
      }),
  },
  {
    name: "openai",
    key: OPENAI_TEST_KEY,
    model: OPENAI_CHAT_MODEL,
    make: (deploymentMode, modelDebug) =>
      new OpenAIGateway({
        apiKey: OPENAI_TEST_KEY,
        fetch: failFetch(OPENAI_TEST_KEY),
        deploymentMode,
        modelDebug,
      }),
  },
  {
    name: "anthropic",
    key: ANTHROPIC_TEST_KEY,
    model: ANTHROPIC_CHAT_MODEL,
    make: (deploymentMode, modelDebug) =>
      new AnthropicGateway({
        apiKey: ANTHROPIC_TEST_KEY,
        fetch: failFetch(ANTHROPIC_TEST_KEY),
        deploymentMode,
        modelDebug,
      }),
  },
];

describe("gateway log hygiene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts sk-or, sk-ant, sk-, and Bearer tokens", () => {
    const text = redactSecrets(
      "Bearer sk-or-v1-live-token sk-ant-api03-live-token sk-proj-live-token",
    );
    expect(text).not.toContain("sk-or-");
    expect(text).not.toContain("sk-ant-");
    expect(text).not.toContain("sk-proj-");
    expect(text).toContain("Bearer [redacted]");
  });

  it.each(adapters)("$name failing call logs no key or prompt", async ({ name, key, model, make }) => {
    const logs = capture();
    await expect(
      make("self_hosted", false).complete({
        model,
        messages: [{ role: "user", content: PROMPT }],
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
    const errorText = logs.errors.join("\n");
    const infoText = logs.infos.join("\n");
    expect(errorText).toContain(name);
    expect(errorText).not.toContain(key);
    expect(errorText).not.toContain(PROMPT);
    expect(errorText).not.toContain("Bearer ");
    expect(infoText).not.toContain(PROMPT);
    expect(infoText).not.toContain(key);
    logs.restore();
  });

  it.each(adapters)("$name logs the prompt only outside cloud when debug is on", async ({ key, model, make }) => {
    const debug = capture();
    await expect(
      make("self_hosted", true).complete({
        model,
        messages: [{ role: "user", content: PROMPT }],
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
    const infoText = debug.infos.join("\n");
    expect(infoText).toContain(PROMPT);
    expect(infoText).not.toContain(key);
    expect(debug.errors.join("\n")).not.toContain(PROMPT);
    debug.restore();
  });

  it.each(adapters)("$name ignores prompt debug in cloud", async ({ key, model, make }) => {
    const logs = capture();
    await expect(
      make("cloud", true).complete({
        model,
        messages: [{ role: "user", content: PROMPT }],
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError);
    const text = `${logs.errors.join("\n")}\n${logs.infos.join("\n")}`;
    expect(text).not.toContain(PROMPT);
    expect(text).not.toContain(key);
    logs.restore();
  });
});
