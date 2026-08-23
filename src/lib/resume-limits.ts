import { PLAN_CONFIG } from "@/lib/plans";
import { SELF_HOST_UNLIMITED } from "@/lib/self-host";

const UNLIMITED_RESUME_LIMITS = {
  base: Number.POSITIVE_INFINITY,
  tailored: Number.POSITIVE_INFINITY,
} as const;

/**
 * Resume caps applied to users without Pro access. On a self-hosted instance
 * every user has Pro access, so these are never reached — they are lifted here
 * as well so that any code path reading the numbers directly stays consistent.
 */
export const FREE_PLAN_RESUME_LIMITS: Record<'base' | 'tailored', number> =
  SELF_HOST_UNLIMITED ? UNLIMITED_RESUME_LIMITS : PLAN_CONFIG.free.limits;

export type ResumeLimitType = keyof typeof FREE_PLAN_RESUME_LIMITS;

export function getResumeLimitExceededMessage(type: ResumeLimitType): string {
  const limit = FREE_PLAN_RESUME_LIMITS[type];
  const label = type === 'base' ? 'base resumes' : 'tailored resumes';
  return `Free plan limit reached: you can create up to ${limit} ${label}. Upgrade to Pro to create more.`;
}
