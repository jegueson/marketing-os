import { AppError, ValidationError, type DeploymentMode } from "@marketing-os/core";
import type { ResolvedModelCredential } from "@marketing-os/db";
import {
  AnthropicGateway,
  assertSafeModelEndpoint,
  ModelGatewayError,
  OpenAICompatibleGateway,
  OpenAIGateway,
  OpenRouterGateway,
  type ModelGateway,
} from "@marketing-os/model-gateway";
import type { AppEnv } from "../env";

export type ModelGatewayFactory = (
  credential: ResolvedModelCredential,
  env: AppEnv,
  bindings: Env,
) => ModelGateway;

function allowPrivateEndpoints(bindings: Env): boolean {
  return bindings.MOS_MODEL_ALLOW_PRIVATE_ENDPOINTS === "1";
}

/** Validates openai_compatible base URLs before save or live calls. */
export function assertModelBaseUrl(
  baseUrl: string,
  deploymentMode: DeploymentMode,
  bindings: Env,
): URL {
  try {
    return assertSafeModelEndpoint(baseUrl, {
      deploymentMode,
      allowPrivateEndpoints: allowPrivateEndpoints(bindings),
    });
  } catch (err) {
    if (err instanceof ModelGatewayError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
}

export function createModelGateway(
  credential: ResolvedModelCredential,
  env: AppEnv,
  bindings: Env,
): ModelGateway {
  const mode = env.deploymentMode;
  const allowPrivate = allowPrivateEndpoints(bindings);
  switch (credential.provider) {
    case "openrouter":
      return new OpenRouterGateway({ apiKey: credential.apiKey });
    case "openai":
      return new OpenAIGateway({ apiKey: credential.apiKey, deploymentMode: mode });
    case "anthropic":
      return new AnthropicGateway({ apiKey: credential.apiKey, deploymentMode: mode });
    case "openai_compatible": {
      if (!credential.baseUrl) {
        throw new ValidationError("openai_compatible requires a base URL");
      }
      const url = assertModelBaseUrl(credential.baseUrl, mode, bindings);
      return new OpenAICompatibleGateway({
        apiKey: credential.apiKey,
        baseUrl: url.toString().replace(/\/$/, ""),
        deploymentMode: mode,
        allowPrivateEndpoints: allowPrivate,
      });
    }
    default:
      throw new AppError("invalid_request", `Unsupported model provider: ${credential.provider as string}`, 422);
  }
}

export function mapGatewayError(err: unknown): never {
  if (err instanceof ModelGatewayError) {
    if (err.code === "auth_failed") {
      throw new AppError("invalid_key", "Model provider rejected the API key", 422);
    }
    if (err.code === "invalid_request") {
      // Endpoint-guard messages are ours; keep them. Never forward provider bodies.
      throw new ValidationError(err.message);
    }
    throw new AppError(
      err.code,
      err.retryable ? "Model provider is temporarily unavailable" : "Model provider request failed",
      err.retryable ? 503 : 422,
    );
  }
  throw err;
}
