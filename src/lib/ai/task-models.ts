import {
  getCanonicalModelId,
  MODEL_DESIGNATIONS,
  type AIConfig,
  type ApiKey,
} from "@/lib/ai-models";
import type { CustomPrompts } from "@/lib/types";
import { SELF_HOST_DEFAULT_MODEL } from "@/lib/self-host";

export type AITaskModel =
  | "structuredExtraction"
  | "resumeScoring"
  | "simpleRewrite"
  | "contentGeneration"
  | "coverLetter"
  | "jobTailoring"
  | "chatAssistant";

interface TaskModelInput {
  config?: AIConfig;
  isPro: boolean;
  task: AITaskModel;
}

interface TaskModelConfigParts {
  apiKeys: ApiKey[];
  customPrompts?: CustomPrompts;
}

function getConfigParts(config?: AIConfig): TaskModelConfigParts {
  return {
    apiKeys: config?.apiKeys ?? [],
    ...(config?.customPrompts ? { customPrompts: config.customPrompts } : {}),
  };
}

export function getTaskModel(task: AITaskModel, isPro: boolean): string {
  // Every designation below is an OpenRouter model that the hosted product
  // funds. A self-hosted instance that cannot reach OpenRouter needs its own
  // default, or these tasks fail before a model is ever contacted.
  if (SELF_HOST_DEFAULT_MODEL) return SELF_HOST_DEFAULT_MODEL;

  switch (task) {
    case "structuredExtraction":
      return MODEL_DESIGNATIONS.STRUCTURED_EXTRACTION;
    case "resumeScoring":
      return MODEL_DESIGNATIONS.RESUME_SCORING;
    case "simpleRewrite":
      return MODEL_DESIGNATIONS.SIMPLE_REWRITE;
    case "contentGeneration":
      return MODEL_DESIGNATIONS.CONTENT_GENERATION;
    case "coverLetter":
      return MODEL_DESIGNATIONS.COVER_LETTER;
    case "jobTailoring":
      return isPro
        ? MODEL_DESIGNATIONS.JOB_TAILORING_PRO
        : MODEL_DESIGNATIONS.JOB_TAILORING_FREE;
    case "chatAssistant":
      return isPro
        ? MODEL_DESIGNATIONS.CHAT_ASSISTANT_PRO
        : MODEL_DESIGNATIONS.CHAT_ASSISTANT_FREE;
  }
}

export function withTaskModel(input: TaskModelInput): AIConfig {
  const selectedModel = input.config?.model?.trim();

  if (selectedModel) {
    return {
      ...getConfigParts(input.config),
      model: getCanonicalModelId(selectedModel),
    };
  }

  return {
    ...getConfigParts(input.config),
    model: getTaskModel(input.task, input.isPro),
  };
}

export function dedupeAIConfigs(configs: AIConfig[]): AIConfig[] {
  const seen = new Set<string>();
  return configs.filter((config) => {
    const canonicalModel = getCanonicalModelId(config.model);
    if (seen.has(canonicalModel)) {
      return false;
    }

    seen.add(canonicalModel);
    return true;
  });
}
