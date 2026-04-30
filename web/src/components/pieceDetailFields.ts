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
