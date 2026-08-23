import type { Resume } from "@/lib/types";

/**
 * One source of truth for which resume sections render, in what order, and
 * whether they are visible.
 *
 * Every writer of `section_order` stores the token `work_experience` — the
 * database default, `createBaseResume`, and the AI tool schema all agree. The
 * preview, however, only recognised `experience`, so `work_experience` was
 * filtered out as unknown and then re-appended at the end. Work history — the
 * most important section on a resume — rendered *below* projects and education.
 *
 * The PDF had a different bug: it ignored `section_order` entirely and used its
 * own fixed order. So the page a student saw and the file they sent to an
 * employer listed their resume in different orders.
 *
 * Both now normalise through here.
 */

export type SectionName = "experience" | "education" | "skills" | "projects";

export const DEFAULT_SECTION_ORDER: SectionName[] = [
  "experience",
  "education",
  "skills",
  "projects",
];

/**
 * Stored tokens mapped to what actually renders. Sections with no renderer
 * (`professional_summary`, `certifications`) are intentionally absent: they are
 * dropped rather than being treated as unknown and shuffled to the end.
 */
const SECTION_ALIASES: Record<string, SectionName> = {
  experience: "experience",
  work_experience: "experience",
  work: "experience",
  employment: "experience",
  education: "education",
  skills: "skills",
  projects: "projects",
  project: "projects",
};

export function canonicalSectionName(token: string): SectionName | null {
  return SECTION_ALIASES[token?.trim().toLowerCase()] ?? null;
}

/** Every stored token that maps to a given section, for config lookups. */
function aliasesFor(section: SectionName): string[] {
  return Object.entries(SECTION_ALIASES)
    .filter(([, canonical]) => canonical === section)
    .map(([alias]) => alias);
}

export function getSectionOrder(resume: Pick<Resume, "section_order">): SectionName[] {
  const requested: SectionName[] = [];

  for (const token of resume.section_order ?? []) {
    const canonical = canonicalSectionName(token);
    if (canonical && !requested.includes(canonical)) {
      requested.push(canonical);
    }
  }

  if (requested.length === 0) return DEFAULT_SECTION_ORDER;

  // Anything the stored order omits still renders, after what it asked for.
  return [
    ...requested,
    ...DEFAULT_SECTION_ORDER.filter((section) => !requested.includes(section)),
  ];
}

/**
 * Visibility is checked under every alias, because configs are written with
 * `work_experience` while the renderer thinks in `experience` — so the
 * work-experience visibility toggle was silently ignored.
 */
export function isSectionVisible(
  resume: Pick<Resume, "section_configs">,
  section: SectionName,
): boolean {
  const configs = resume.section_configs;
  if (!configs) return true;

  for (const alias of aliasesFor(section)) {
    const config = configs[alias];
    if (config && config.visible === false) return false;
  }

  return true;
}
