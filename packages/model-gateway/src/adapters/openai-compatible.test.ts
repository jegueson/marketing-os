import { describe, expect, it } from "vitest";
import { runGatewayContract } from "../contract";
import { ModelGatewayError } from "../errors";
import { OpenAICompatibleGateway } from "./openai-compatible";
import {
  COMPAT_BASE_URL,
  COMPAT_CHAT_MODEL,
  COMPAT_EMBED_MODEL,
  COMPAT_TEST_KEY,
  recordedCompatFetch,
} from "./openai-compatible.fixtures";

function gateway(
  fetchImpl: typeof fetch = recordedCompatFetch(),
  overrides: Partial<ConstructorParameters<typeof OpenAICompatibleGateway>[0]> = {},
) {
  return new OpenAICompatibleGateway({
    apiKey: COMPAT_TEST_KEY,
    baseUrl: COMPAT_BASE_URL,
    fetch: fetchImpl,
    deploymentMode: "self_hosted",
    allowPrivateEndpoints: true,
    structuredOutput: "json_object",
    ...overrides,
  });
}

describe("OpenAICompatibleGateway", () => {
  it("passes the contract kit against recorded fixtures", async () => {
    await expect(runGatewayContract(gateway())).resolves.toBeUndefined();
  });

  it("reports json_object (not json_schema) for local chat models", async () => {
    const caps = await gateway().getCapabilities(COMPAT_CHAT_MODEL);
    expect(caps.structuredOutput).toBe("json_object");
    expect(caps.supportsEmbeddings).toBe(false);
    const embedCaps = await gateway().getCapabilities(COMPAT_EMBED_MODEL);
    expect(embedCaps.structuredOutput).toBe("none");
    expect(embedCaps.supportsEmbeddings).toBe(true);
  });

  it("estimates unknown local pricing as null", async () => {
    const cost = await gateway().estimateCost(COMPAT_CHAT_MODEL, 10, 5);
    expect(cost.estimatedCostMicroUsd).toBeNull();
    expect(cost.costBasis).toBe("unknown");
  });

  it("completes and streams from fixtures", async () => {
    const complete = await gateway().complete({
      model: COMPAT_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(complete.content).toContain("Hello");

    const parts: string[] = [];
    for await (const chunk of gateway().stream({
      model: COMPAT_CHAT_MODEL,
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (chunk.type === "delta") parts.push(chunk.text);
    }
    expect(parts.join("")).toBe("Hi!");
  });

  it("refuses cloud localhost without going private", async () => {
    expect(
      () =>
        new OpenAICompatibleGateway({
          apiKey: COMPAT_TEST_KEY,
          baseUrl: COMPAT_BASE_URL,
          fetch: recordedCompatFetch(),
          deploymentMode: "cloud",
        }),
    ).not.toThrow();

    await expect(
      gateway(recordedCompatFetch(), {
        deploymentMode: "cloud",
        allowPrivateEndpoints: false,
      }).listModels(),
    ).rejects.toBeInstanceOf(ModelGatewayError);
  });

  it("refuses a redirect to a private metadata IP", async () => {
    await expect(
      gateway(
        recordedCompatFetch({ redirectTo: "https://169.254.169.254/latest/meta-data" }),
        { deploymentMode: "self_hosted", allowPrivateEndpoints: true },
      ).listModels(),
    ).rejects.toThrow(/blocked|private|Cross-origin/i);
  });

  it("follows a same-origin redirect and refuses cross-origin", async () => {
    let followed = false;
    const sameOrigin: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (!followed && url.pathname === "/v1/models") {
        followed = true;
        return new Response(null, {
          status: 302,
          headers: { Location: "https://models.example.com/v1/models?followed=1" },
        });
      }
      return recordedCompatFetch()(input, init);
    };
    const models = await gateway(sameOrigin, {
      baseUrl: "https://models.example.com/v1",
      deploymentMode: "cloud",
      allowPrivateEndpoints: false,
    }).listModels();
    expect(models.some((m) => m.id === COMPAT_CHAT_MODEL)).toBe(true);
    expect(followed).toBe(true);

    await expect(
      gateway(
        recordedCompatFetch({ redirectTo: "https://evil.example.com/v1/models" }),
        {
          baseUrl: "https://models.example.com/v1",
          deploymentMode: "cloud",
          allowPrivateEndpoints: false,
        },
      ).listModels(),
    ).rejects.toThrow(/Cross-origin/);
  });
});
