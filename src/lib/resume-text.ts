/**
 * Join resume fields for display, skipping the ones that aren't there.
 *
 * Several fields in the schema are optional — `field` on an education entry,
 * for instance — but were rendered with template literals:
 *
 *     `${edu.degree} ${edu.field}`
 *
 * When the parser doesn't find one, JavaScript stringifies it and the literal
 * word "undefined" is printed. That reached the PDF, so a downloaded resume
 * could read "Master of Science (M.S) undefined". Anything user-facing built
 * from optional fields should go through here instead.
 */
export function joinDefined(
  parts: Array<string | null | undefined>,
  separator = " ",
): string {
  return parts
    .filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0,
    )
    .map((part) => part.trim())
    .join(separator);
}
