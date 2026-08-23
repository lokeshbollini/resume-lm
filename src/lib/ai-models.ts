/**
 * Centralized AI Model Management
 * This file contains all AI model and provider configurations used throughout the application
 */

import { ServiceName } from './types'
import { SELF_HOST_UNLIMITED, SELF_HOST_DEFAULT_MODEL } from './self-host'

// ========================
// Type Definitions
// ========================

export interface AIProvider {
  id: ServiceName
  name: string
  apiLink: string
  logo?: string
  envKey: string
  sdkInitializer: string
  unstable?: boolean
  /** Provider that needs no credential (a local server). Hidden from Settings. */
  keyless?: boolean
}

export interface AIModel {
  id: string
  name: string
  provider: ServiceName
  /** Hidden compatibility models remain resolvable but are not shown in the selector. */
  isVisible?: boolean
  features: {
    isFree?: boolean
    isRecommended?: boolean
    isUnstable?: boolean
    maxTokens?: number
    supportsVision?: boolean
    supportsTools?: boolean
    isPro?: boolean
  }
  availability: {
    requiresApiKey: boolean
    requiresPro: boolean
  }
}

export interface ApiKey {
  service: ServiceName
  key: string
  addedAt: string
}

export interface AIConfig {
  model: string
  apiKeys: ApiKey[]
  customPrompts?: import('./types').CustomPrompts
}

export interface GroupedModels {
  provider: ServiceName
  name: string
  models: AIModel[]
}

// ========================
// Provider Configurations
// ========================

export const PROVIDERS: Partial<Record<ServiceName, AIProvider>> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    apiLink: 'https://console.anthropic.com/',
    logo: '/logos/claude.png',
    envKey: 'ANTHROPIC_API_KEY',
    sdkInitializer: 'anthropic',
    unstable: false
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiLink: 'https://platform.openai.com/api-keys',
    logo: '/logos/chat-gpt-logo.png',
    envKey: 'OPENAI_API_KEY',
    sdkInitializer: 'openai',
    unstable: false
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    apiLink: 'https://openrouter.ai/account/api-keys',
    logo: '/logos/gemini-logo.webp',
    envKey: 'OPENROUTER_API_KEY',
    sdkInitializer: 'openrouter',
    unstable: false

  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (local)',
    apiLink: 'https://ollama.com/download',
    envKey: 'OLLAMA_API_KEY',
    sdkInitializer: 'ollama',
    unstable: false,
    // A local Ollama server ignores the Authorization header entirely, so
    // there is no key for a user to obtain, paste, or manage.
    keyless: true
  },
}

// ========================
// Ollama (local, zero-cost) Models
// ========================

/**
 * Ollama exposes an OpenAI-compatible endpoint, so any locally pulled model can
 * be driven through the existing OpenAI provider with a different base URL.
 *
 * Which models exist is a property of the machine running Ollama, not of this
 * codebase, so the catalog is built from an env variable instead of hardcoded.
 * Set NEXT_PUBLIC_OLLAMA_MODELS to a comma-separated list of tags you have
 * pulled, e.g. "llama3.1:8b,qwen2.5:14b,mistral:7b". Leave it unset to hide
 * Ollama from the model picker entirely.
 */
function buildOllamaModels(): AIModel[] {
  const raw = process.env.NEXT_PUBLIC_OLLAMA_MODELS?.trim()
  if (!raw) return []

  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
    .map(tag => ({
      id: `ollama/${tag}`,
      name: `${tag} (local)`,
      provider: 'ollama' as ServiceName,
      features: {
        // Free in the literal sense: the request never leaves your machine.
        isFree: true,
        isRecommended: false,
        isUnstable: false,
        maxTokens: 128000,
        supportsVision: false,
        supportsTools: true,
      },
      availability: {
        requiresApiKey: false,
        requiresPro: false,
      },
    }))
}

// ========================
// Model Definitions
// ========================

export const AI_MODELS: AIModel[] = [
  // The visible catalog is intentionally curated. These models are all routed
  // through OpenRouter so app-funded free and Pro requests share one reliable
  // billing surface. Legacy IDs remain aliases below for saved selections.
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'openrouter',
    features: {
      isFree: true,
      isRecommended: true,
      isUnstable: false,
      maxTokens: 1050000,
      supportsVision: true,
      supportsTools: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: false
    }
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    provider: 'openrouter',
    features: {
      isRecommended: true,
      isUnstable: false,
      maxTokens: 1050000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: true
    }
  },
  {
    id: 'anthropic/claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'openrouter',
    features: {
      isRecommended: true,
      isUnstable: false,
      maxTokens: 1000000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: true
    }
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'openrouter',
    features: {
      // "Free" means app-funded for ResumeLM users, not zero provider cost.
      isFree: true,
      isRecommended: false,
      isUnstable: false,
      maxTokens: 1048576,
      supportsVision: false,
      supportsTools: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: false
    }
  },
  {
    id: 'openai/gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openrouter',
    features: {
      isRecommended: false,
      isUnstable: false,
      maxTokens: 1050000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: true
    }
  },
  {
    id: 'anthropic/claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'openrouter',
    features: {
      isRecommended: false,
      isUnstable: false,
      maxTokens: 1000000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: true
    }
  },
  {
    id: 'moonshotai/kimi-k3',
    name: 'Kimi K3',
    provider: 'openrouter',
    features: {
      isRecommended: false,
      isUnstable: false,
      maxTokens: 1048576,
      supportsVision: true,
      supportsTools: true
    },
    availability: {
      requiresApiKey: false,
      requiresPro: true
    }
  },
  {
    id: 'google/gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'openrouter',
    features: {
      isRecommended: false,
      isUnstable: false,
      maxTokens: 1000000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: true,
      requiresPro: true
    }
  },
  // Direct Anthropic models remain hidden compatibility targets for users who
  // previously configured an Anthropic BYOK key. New users see the OpenRouter
  // versions above, which keep app-funded routing consistent across plans.
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5 (Anthropic key)',
    provider: 'anthropic',
    isVisible: false,
    features: {
      isUnstable: false,
      maxTokens: 1000000,
      supportsVision: true,
      supportsTools: true
    },
    availability: {
      requiresApiKey: true,
      requiresPro: false
    }
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5 (Anthropic key)',
    provider: 'anthropic',
    isVisible: false,
    features: {
      isUnstable: false,
      maxTokens: 1000000,
      supportsVision: true,
      supportsTools: true,
      isPro: true
    },
    availability: {
      requiresApiKey: true,
      requiresPro: true
    }
  },
  ...buildOllamaModels(),
].map(applySelfHostOverrides)

/**
 * On a self-hosted instance there is no paid tier and no app-funded key to
 * protect, so nothing needs to stay Pro-only or hidden. The direct-Anthropic
 * entries in particular stop being BYOK-only compatibility targets and become
 * first-class options backed by this deployment's own ANTHROPIC_API_KEY.
 */
function applySelfHostOverrides(model: AIModel): AIModel {
  if (!SELF_HOST_UNLIMITED) return model

  return {
    ...model,
    isVisible: true,
    availability: {
      ...model.availability,
      requiresPro: false,
    },
  }
}

// ========================
// Legacy ID Aliases
// ========================

// Map legacy or shorthand model IDs to current canonical IDs
const MODEL_ALIASES: Record<string, string> = {
  // Older Claude IDs → current best equivalents
  'claude-4-sonnet': 'claude-sonnet-5',
  'claude-3-sonnet-20240229': 'claude-sonnet-5',
  'claude-sonnet-4-20250514': 'claude-sonnet-5',
  'claude-sonnet-4.5': 'claude-sonnet-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-5',
  'claude-sonnet-4-6': 'claude-sonnet-5',
  'claude-opus-4.5': 'claude-opus-5',
  'claude-opus-4-5-20251101': 'claude-opus-5',
  'claude-opus-4-7': 'claude-opus-5',
  // Direct OpenAI and older GPT IDs → OpenRouter-managed equivalents.
  // This also migrates existing localStorage selections away from the
  // exhausted direct OpenAI server key.
  'gpt-5': 'openai/gpt-5.6-terra',
  'gpt-5.2': 'openai/gpt-5.6-terra',
  'gpt-5.2-2025-12-11': 'openai/gpt-5.6-terra',
  'gpt-5.2-pro': 'openai/gpt-5.6-sol',
  'gpt-5.2-pro-2025-12-11': 'openai/gpt-5.6-sol',
  'gpt-5.4': 'openai/gpt-5.6-terra',
  'gpt-5.4-pro': 'openai/gpt-5.6-sol',
  'gpt-5.5': 'openai/gpt-5.6-terra',
  'gpt-5.5-pro': 'openai/gpt-5.6-sol',
  'openai/gpt-5.5': 'openai/gpt-5.6-terra',
  'openai/gpt-5.5-pro': 'openai/gpt-5.6-sol',
  'gpt-5.1-chat': 'openai/gpt-5.6-luna',
  'gpt-5.4-mini': 'openai/gpt-5.6-luna',
  'gpt-5.4-nano': 'openai/gpt-5.6-luna',
  'gpt-5-mini-2025-08-07': 'openai/gpt-5.6-luna',
  'gpt-5-mini': 'openai/gpt-5.6-luna',
  'gpt-5-nano': 'openai/gpt-5.6-luna',
  // DeepSeek model migrations
  'deepseek/deepseek-v3.2': 'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v3.2:nitro': 'deepseek/deepseek-v4-flash',
  'deepseek-chat': 'deepseek/deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek/deepseek-v4-pro',
  // Legacy Gemini model ID without provider prefix
  'gemini-3-pro-preview': 'google/gemini-3.6-flash',
}

// ========================
// Default Model Configuration
// ========================

export const DEFAULT_MODELS = {
  PRO_USER: 'openai/gpt-5.6-terra',
  FREE_USER: 'openai/gpt-5.6-luna'
} as const

// ========================
// Model Designations for Different Use Cases
// ========================

/**
 * Designated models for specific use cases throughout the application.
 * Change these to update which models are used globally.
 */
export const MODEL_DESIGNATIONS = {
  // Fast & cheap model for parsing, simple tasks, quick analysis
  FAST_CHEAP: 'openai/gpt-5.6-luna',
  // Alternative fast & cheap option (free for all users)
  FAST_CHEAP_FREE: 'openai/gpt-5.6-luna',
  // Structured extraction, parsing, and data normalization
  STRUCTURED_EXTRACTION: 'openai/gpt-5.6-luna',
  // Resume scoring and analysis
  RESUME_SCORING: 'openai/gpt-5.6-luna',
  // Single-item rewrites and lightweight editing
  SIMPLE_REWRITE: 'openai/gpt-5.6-luna',
  // Multi-bullet and polished content generation
  CONTENT_GENERATION: 'openai/gpt-5.6-luna',
  // Cover letter generation
  COVER_LETTER: 'openai/gpt-5.6-luna',
  // Full resume tailoring by plan
  JOB_TAILORING_FREE: 'openai/gpt-5.6-luna',
  JOB_TAILORING_PRO: 'openai/gpt-5.6-terra',
  // Interactive assistant by plan
  CHAT_ASSISTANT_FREE: 'openai/gpt-5.6-luna',
  CHAT_ASSISTANT_PRO: 'openai/gpt-5.6-terra',
  // Frontier model for complex tasks, deep analysis, best quality
  FRONTIER: 'openai/gpt-5.6-sol',
  // Alternative frontier model
  FRONTIER_ALT: 'anthropic/claude-opus-5',
  // Balanced model - good quality but faster/cheaper than frontier
  BALANCED: 'openai/gpt-5.6-terra',
  // Vision-capable model for image analysis
  VISION: 'openai/gpt-5.6-luna',
  // Default models by user type
  DEFAULT_PRO: 'openai/gpt-5.6-terra',
  DEFAULT_FREE: 'openai/gpt-5.6-luna'
} as const

// Type for model designations
export type ModelDesignation = keyof typeof MODEL_DESIGNATIONS

export function getCanonicalModelId(modelId: string): string {
  let canonical = modelId.trim()

  // Resolve aliases repeatedly so future migrations can point at another
  // legacy alias without leaving a stale ID in localStorage or telemetry.
  for (let i = 0; i < 5; i += 1) {
    const next = MODEL_ALIASES[canonical] ?? MODEL_ALIASES[canonical.toLowerCase()]
    if (!next || next === canonical) break
    canonical = next
  }

  return canonical
}

/**
 * Read and migrate the browser's saved model selection in one place. This is
 * intentionally safe to call from server-rendered modules: it is a no-op
 * until a browser is available.
 */
export function getStoredModelSelection(fallback = ""): string {
  if (typeof window === "undefined") return fallback

  const storageKey = "resumelm-default-model"
  const stored = window.localStorage.getItem(storageKey) ?? ""
  const normalized = getCanonicalModelId(stored || fallback)

  if (normalized !== stored) {
    window.localStorage.setItem(storageKey, normalized)
  }

  return normalized
}

// ========================
// Utility Functions
// ========================

/**
 * Get all providers as an array
 */
export function getProvidersArray(): AIProvider[] {
  // Include providers that still have hidden compatibility models so existing
  // BYOK users can continue to manage their keys in Settings.
  const selectableProviders = new Set(AI_MODELS.map(model => model.provider))
  return Object.values(PROVIDERS).filter(
    provider =>
      selectableProviders.has(provider.id) &&
      // Keyless providers have nothing to paste. Rendering an "Enter API key"
      // box and a "Get your API key" link for a local Ollama server just
      // invites people to hunt for a credential that does not exist.
      !provider.keyless,
  )
}

/**
 * Get a model by its ID
 */
export function getModelById(id: string): AIModel | undefined {
  const resolvedId = getCanonicalModelId(id)
  return AI_MODELS.find(model => model.id === resolvedId)
}

/**
 * Get a provider by its ID
 */
export function getProviderById(id: ServiceName): AIProvider | undefined {
  return PROVIDERS[id]
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: ServiceName): AIModel[] {
  return AI_MODELS.filter(model => model.provider === provider && model.isVisible !== false)
}

/**
 * Check if a model is available for a user
 */
export function isModelAvailable(
  modelId: string,
  isPro: boolean,
  apiKeys: ApiKey[]
): boolean {
  const model = getModelById(modelId)
  if (!model) return false

  // A self-hosted instance funds every model with its own keys, so the picker
  // offers all of them. If the matching key is missing the server returns a
  // "no API key configured" error naming the provider, which is a clearer
  // signal than silently hiding the model.
  if (SELF_HOST_UNLIMITED) return true

  if (model.availability.requiresPro && !isPro) return false

  // Models marked requiresApiKey cannot use ResumeLM's app-funded key, even
  // for Pro users. This keeps the selector aligned with server-side access.
  if (model.availability.requiresApiKey) {
    return apiKeys.some(
      key => key.service === model.provider && key.key.trim().length > 0,
    )
  }

  // Free model allowance
  if (model.features.isFree) return true

  // App-funded OpenRouter models are available to Pro users without a BYOK
  // key. Other providers require a matching user key.
  return isPro && model.provider === 'openrouter'
}

/**
 * Get the default model for a user type
 */
export function getDefaultModel(isPro: boolean): string {
  // A self-hosted instance may not have a key for the app-funded defaults.
  if (SELF_HOST_DEFAULT_MODEL) return SELF_HOST_DEFAULT_MODEL
  return isPro ? DEFAULT_MODELS.PRO_USER : DEFAULT_MODELS.FREE_USER
}

/**
 * Get the provider for a model
 */
export function getModelProvider(modelId: string): AIProvider | undefined {
  const model = getModelById(modelId)
  if (!model) return undefined
  return getProviderById(model.provider)
}

/**
 * Group models by provider for display
 */
export function groupModelsByProvider(): GroupedModels[] {
  const providerOrder: ServiceName[] = ['anthropic', 'openai', 'openrouter', 'ollama']
  const grouped = new Map<ServiceName, AIModel[]>()

  // Group models by provider
  AI_MODELS.filter(model => model.isVisible !== false).forEach(model => {
    if (!grouped.has(model.provider)) {
      grouped.set(model.provider, [])
    }
    grouped.get(model.provider)!.push(model)
  })

  // Return in ordered format
  return providerOrder
    .map(providerId => {
      const provider = getProviderById(providerId)
      if (!provider) return null
      
      return {
        provider: providerId,
        name: provider.name,
        models: grouped.get(providerId) || []
      }
    })
    .filter((group): group is GroupedModels => group !== null && group.models.length > 0)
}

/**
 * Get selectable models for a user
 */
export function getSelectableModels(isPro: boolean, apiKeys: ApiKey[]): AIModel[] {
  return AI_MODELS.filter(
    model => model.isVisible !== false && isModelAvailable(model.id, isPro, apiKeys)
  )
}

/**
 * Determine which SDK to use for a model
 */
export function getModelSDKConfig(modelId: string): { provider: AIProvider; modelId: string } | undefined {
  const canonicalModelId = getCanonicalModelId(modelId)
  const model = getModelById(canonicalModelId)
  if (!model) return undefined
  
  const provider = getProviderById(model.provider)
  if (!provider) return undefined
  
  return { provider, modelId: canonicalModelId }
}
