/**
 * The picker UI always works with strings, but the API treats blank optional
 * fields as absent. These helpers keep that translation consistent across
 * dialogs and autosaved forms.
 */
export function normalizeOptionalText(value: string | null | undefined): string {
  return value ?? "";
}

export function entryNameOrEmpty(
  entry: { name: string } | null | undefined,
): string {
  return normalizeOptionalText(entry?.name);
}

export function undefinedIfBlank(
  value: string | null | undefined,
): string | undefined {
  const trimmed = normalizeOptionalText(value).trim();
  return trimmed === "" ? undefined : trimmed;
}
