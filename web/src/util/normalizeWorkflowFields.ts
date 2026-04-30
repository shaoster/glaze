/**
 * Normalizes workflow-driven form values into the primitive payload shape the
 * API expects. Some UI flows hold global-ref fields as full objects so users
 * can browse and edit richer values, while `updatePiece`/`updateCurrentState`
 * still accept only primitive scalars and referenced IDs.
 */
export function normalizeFields(
  fields: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "object" && value !== null && "id" in value) {
      const id = (value as { id: unknown }).id;
      result[key] = typeof id === "string" ? id : null;
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    } else {
      result[key] = null;
    }
  }
  return result;
}
