import {
  getModelById,
  getProviderById,
  type AIModel,
} from "@/lib/ai-models";
import type { ServiceName } from "@/lib/types";
import { SELF_HOST_UNLIMITED } from "@/lib/self-host";

/**
 * Ollama serves models locally over an OpenAI-compatible API and ignores the
 * Authorization header, but the OpenAI SDK still insists on a non-empty key.
 */
const OLLAMA_PLACEHOLDER_KEY = "ollama";

interface APIKeyInput {
  service: string;
  key: string;
  addedAt?: string;
}

export interface ResolveAIRequestInput {
  requestedModel: string;
  apiKeys: APIKeyInput[];
  isPro: boolean;
}

export interface ResolvedAIRequest {
  providerId: ServiceName;
  modelId: string;
  apiKey: string;
  usedServerKey: boolean;
  requiresRateLimit: boolean;
}

export type AIRequestAccessCode =
  | "invalid_model"
  | "unsupported_provider"
  | "missing_api_key";

export class AIRequestAccessError extends Error {
  constructor(
    message: string,
    public readonly code: AIRequestAccessCode,
    public readonly modelId?: string,
  ) {
    super(message);
    this.name = "AIRequestAccessError";
  }
}

type HiddenModel = Pick<AIModel, "id" | "name" | "provider" | "features" | "availability">;

const HIDDEN_MODELS: Record<string, HiddenModel> = {};

function getKnownModel(modelId: string): HiddenModel | undefined {
  return getModelById(modelId) ?? HIDDEN_MODELS[modelId];
}

function findUserKey(apiKeys: ResolveAIRequestInput["apiKeys"], providerId: ServiceName) {
  return apiKeys.find(
    (apiKey) => apiKey.service === providerId && apiKey.key.trim().length > 0,
  )?.key.trim();
}

function getServerKey(providerId: ServiceName) {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw new AIRequestAccessError(
      `Unsupported provider: ${providerId}`,
      "unsupported_provider",
      providerId,
    );
  }

  if (providerId === "ollama") {
    return {
      provider,
      apiKey: process.env[provider.envKey]?.trim() || OLLAMA_PLACEHOLDER_KEY,
    };
  }

  return {
    provider,
    apiKey: process.env[provider.envKey]?.trim(),
  };
}

export function resolveAIRequest(input: ResolveAIRequestInput): ResolvedAIRequest {
  const model = getKnownModel(input.requestedModel);

  if (!model) {
    throw new AIRequestAccessError(
      `Unknown model: ${input.requestedModel}`,
      "invalid_model",
      input.requestedModel,
    );
  }

  const provider = getProviderById(model.provider);
  if (!provider) {
    throw new AIRequestAccessError(
      `Unsupported provider: ${model.provider}`,
      "unsupported_provider",
      model.id,
    );
  }

  const freeServerModel =
    model.features.isFree === true && model.availability.requiresPro === false;

  // A self-hosted instance has no paid tier, so every user reaches the server
  // key. Local Ollama models are always server-side: there is no user key.
  const canUseServerKey =
    input.isPro || freeServerModel || SELF_HOST_UNLIMITED || model.provider === "ollama";

  if (canUseServerKey) {
    const { apiKey } = getServerKey(model.provider);

    if (apiKey?.length) {
      return {
        providerId: model.provider,
        modelId: model.id,
        apiKey,
        usedServerKey: true,
        // Ollama runs on your own hardware, so throttling it protects nothing.
        requiresRateLimit: model.provider !== "ollama",
      };
    }
  }

  const userApiKey = findUserKey(input.apiKeys, model.provider);
  if (!userApiKey) {
    throw new AIRequestAccessError(
      SELF_HOST_UNLIMITED
        ? `No ${provider.name} API key configured. Set ${provider.envKey} in this deployment's environment, or add a personal ${provider.name} key in Settings.`
        : `${provider.name} API key not found in user configuration`,
      "missing_api_key",
      model.id,
    );
  }

  return {
    providerId: model.provider,
    modelId: model.id,
    apiKey: userApiKey,
    usedServerKey: false,
    requiresRateLimit: false,
  };
}
