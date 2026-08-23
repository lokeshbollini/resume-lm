/**
 * Split raw resume text into its labelled sections before any model sees it.
 *
 * Asking a model to read a whole resume and simultaneously decide which of
 * five schema arrays each line belongs to is two jobs at once, and small
 * open-weight models reliably fail the second one: every bullet under
 * "Data Analyst, State of Arkansas" comes back as a standalone `project`
 * while `work_experience` is left empty.
 *
 * The section boundaries, though, are not a language problem — they are
 * printed in the document as headings. Finding them with a regex is exact and
 * free, and it turns one ambiguous task into several unambiguous ones: this
 * block is the experience, extract jobs from it. It also lets us state a fact
 * the model cannot get wrong — a resume with no PROJECTS heading has no
 * projects — instead of hoping it infers that.
 */

export type ResumeSectionKind =
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "publications"
  | "awards"
  | "other";

export interface ResumeSections {
  /** Text above the first heading: name, contact details, headline. */
  header: string;
  /** Section body keyed by kind. Absent key means the heading was not present. */
  sections: Partial<Record<ResumeSectionKind, string>>;
}

/**
 * Heading synonyms, longest-first within each kind so that
 * "CERTIFICATIONS AND SKILLS" is not matched as bare "SKILLS".
 */
const HEADING_PATTERNS: Array<{ kind: ResumeSectionKind; pattern: RegExp }> = [
  { kind: "experience", pattern: /^(?:professional|work|employment|relevant)?\s*experience$/i },
  { kind: "experience", pattern: /^employment(?:\s+history)?$/i },
  { kind: "education", pattern: /^education(?:\s+(?:and|&)\s+training)?$/i },
  { kind: "education", pattern: /^academic\s+background$/i },
  { kind: "projects", pattern: /^(?:personal|academic|selected|key)?\s*projects?$/i },
  { kind: "skills", pattern: /^(?:certifications?\s+(?:and|&)\s+)?skills?$/i },
  { kind: "skills", pattern: /^technical\s+skills?$/i },
  { kind: "skills", pattern: /^skills?\s+(?:and|&)\s+certifications?$/i },
  { kind: "skills", pattern: /^certifications?$/i },
  { kind: "publications", pattern: /^publications?$/i },
  { kind: "awards", pattern: /^(?:leadership\s+(?:and|&)\s+)?awards?(?:\s+(?:and|&)\s+honou?rs)?$/i },
  { kind: "awards", pattern: /^(?:honou?rs|achievements|leadership)$/i },
  { kind: "summary", pattern: /^(?:professional\s+)?summary$/i },
  { kind: "summary", pattern: /^(?:career\s+)?objective$/i },
  { kind: "summary", pattern: /^about(?:\s+me)?$/i },
  { kind: "summary", pattern: /^profile$/i },
];

/**
 * PDF text extraction commonly doubles or triples the spaces between words, so
 * "WORK   EXPERIENCE" must still match "work experience".
 */
function normalizeHeadingCandidate(line: string): string {
  return line
    .replace(/[•·*|:_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchHeading(line: string): ResumeSectionKind | null {
  const candidate = normalizeHeadingCandidate(line);

  // A heading is short. This is what stops a sentence that merely contains the
  // word "experience" from being treated as the start of a section.
  if (candidate.length === 0 || candidate.length > 40) return null;
  if (candidate.split(" ").length > 4) return null;

  for (const { kind, pattern } of HEADING_PATTERNS) {
    if (pattern.test(candidate)) return kind;
  }

  return null;
}

export function splitResumeSections(text: string): ResumeSections {
  const lines = text.split(/\r?\n/);

  const headerLines: string[] = [];
  const sections: Partial<Record<ResumeSectionKind, string[]>> = {};

  let current: ResumeSectionKind | null = null;

  for (const line of lines) {
    const kind = matchHeading(line);

    if (kind) {
      current = kind;
      // Repeated headings append rather than overwrite, so a resume that
      // splits experience across pages keeps both halves.
      sections[kind] ??= [];
      continue;
    }

    if (current) {
      sections[current]!.push(line);
    } else {
      headerLines.push(line);
    }
  }

  const result: Partial<Record<ResumeSectionKind, string>> = {};
  for (const [kind, value] of Object.entries(sections)) {
    const body = value.join("\n").trim();
    if (body.length > 0) {
      result[kind as ResumeSectionKind] = body;
    }
  }

  return { header: headerLines.join("\n").trim(), sections: result };
}

/**
 * Rebuild the resume as an explicitly labelled document, so the model is told
 * which schema field each block feeds instead of having to work it out.
 */
export function buildLabelledResumeText(text: string): {
  labelled: string;
  hasExperience: boolean;
  hasProjects: boolean;
  experienceBlock?: string;
} {
  const { header, sections } = splitResumeSections(text);

  // Nothing recognisable — hand back the original rather than mangling it.
  if (Object.keys(sections).length === 0) {
    return { labelled: text, hasExperience: false, hasProjects: false };
  }

  const labels: Record<ResumeSectionKind, string> = {
    summary: "SUMMARY (context only — do not emit as a section)",
    education: "EDUCATION → education[]",
    experience: "EXPERIENCE → work_experience[] (every job here; bullets stay with their job)",
    projects: "PROJECTS → projects[]",
    skills: "SKILLS → skills[]",
    publications: "PUBLICATIONS (context only)",
    awards: "AWARDS (context only)",
    other: "OTHER (context only)",
  };

  const parts: string[] = [];
  if (header) parts.push(`### CONTACT / HEADER → basic info\n${header}`);

  const order: ResumeSectionKind[] = [
    "summary",
    "education",
    "experience",
    "projects",
    "skills",
    "publications",
    "awards",
    "other",
  ];

  for (const kind of order) {
    const body = sections[kind];
    if (body) parts.push(`### ${labels[kind]}\n${body}`);
  }

  return {
    labelled: parts.join("\n\n"),
    hasExperience: Boolean(sections.experience),
    hasProjects: Boolean(sections.projects),
    experienceBlock: sections.experience,
  };
}
