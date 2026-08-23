/**
 * Self-hosted "unlimited" mode.
 *
 * The hosted ResumeLM product gates premium AI models and resume counts behind
 * a paid Pro plan because ResumeLM funds those model calls. A self-hosted
 * deployment funds its own model calls with its own provider keys, so that
 * billing gate has nothing left to protect.
 *
 * Setting NEXT_PUBLIC_SELF_HOST_UNLIMITED="true" collapses the two plans into
 * one: every signed-in user of THIS instance is treated as Pro, resume limits
 * are lifted, and the upgrade/pricing UI is hidden.
 *
 * COST WARNING: this does not make AI free. Every request that this instance
 * funds bills the provider key configured in this deployment's environment
 * (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, ...). If you share the instance,
 * you are paying for everyone on it. Point users at a local Ollama model, or
 * ask them to bring their own key, if that is not what you want.
 *
 * Only NEXT_PUBLIC_ variables are readable from both server and client code in
 * Next.js, so this flag is deliberately public. It reveals nothing sensitive:
 * it only states that this deployment has no paid tier.
 */
export const SELF_HOST_UNLIMITED =
  process.env.NEXT_PUBLIC_SELF_HOST_UNLIMITED === "true";

export function isSelfHostUnlimited(): boolean {
  return SELF_HOST_UNLIMITED;
}
