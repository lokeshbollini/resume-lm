import { z } from "zod";

/**
 * Coercions that let a schema survive the shapes small models actually emit.
 *
 * Frontier models return well-typed JSON. Open-weight models in the 8B–20B
 * range routinely get the *types* wrong while getting the content right — most
 * often by returning a JSON-encoded string where an array or object was asked
 * for. Zod then rejects the whole tool call:
 *
 *     Invalid arguments for tool modifyWholeResume: Type validation failed:
 *     Value: {"work_experience":"[{\"company\": \"Company 1\", ...}]"}
 *     expected array, received string
 *
 * The model did the work; only the encoding is wrong. Parsing that string
 * before validation turns a hard failure into a success, and is a no-op for a
 * model that got it right the first time.
 *
 * These are deliberately narrow. They repair encoding, never content: a string
 * that is not JSON and not a list stays exactly as it is, and anything that
 * fails to parse is handed to Zod unchanged so the original error still
 * surfaces.
 */

/** Parse a JSON-encoded array or object. Anything else passes through. */
export function coerceJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Not valid JSON after all — let Zod report the real problem.
    return value;
  }
}

/**
 * Coerce to a list of strings. Handles the three shapes models produce for a
 * bullet list: a real array, a JSON-encoded array, and one blob of text with
 * the bullets on separate lines.
 */
export function coerceStringList(value: unknown): unknown {
  const parsed = coerceJsonValue(value);
  if (typeof parsed !== "string") return parsed;

  const lines = parsed
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s•·*\-–—]+/, "").trim())
    .filter((line) => line.length > 0);

  // A single-line string is one bullet, not zero.
  return lines.length > 0 ? lines : [parsed];
}

/** z.array(item) that also accepts a JSON-encoded array. */
export function tolerantArray<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess(coerceJsonValue, z.array(item));
}

/** z.array(z.string()) that also accepts JSON or newline-separated text. */
export function tolerantStringArray() {
  return z.preprocess(coerceStringList, z.array(z.string()));
}

/** An object schema that also accepts a JSON-encoded object. */
export function tolerantObject<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(coerceJsonValue, schema);
}

/**
 * Coerce a numeric string to a number.
 *
 * Models routinely quote numbers in JSON — `{"index": "0"}` — because the
 * surrounding fields are strings. That failed every indexed tool with
 * "expected number, received string", which is the difference between the
 * assistant editing the right entry and refusing to act at all.
 *
 * Only strings that are entirely a number convert; "0 (first)" stays a string
 * so Zod still rejects it.
 */
export function coerceNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed.length === 0) return value;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}

/** z.number() that also accepts a quoted number. */
export function tolerantNumber() {
  return z.preprocess(coerceNumber, z.number());
}
