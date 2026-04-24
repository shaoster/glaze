const PUBLIC_SUFFIX = " (public)";

/** Strips the "(public)" suffix added for display disambiguation, returning the raw name. */
export function stripPublicSuffix(displayName: string): string {
  return displayName.endsWith(PUBLIC_SUFFIX)
    ? displayName.slice(0, -PUBLIC_SUFFIX.length)
    : displayName;
}

const CREATE_OPTION_PREFIX = 'Create "';
const CREATE_OPTION_SUFFIX = '"';

/** Wraps a user-typed label in the create sentinel so it can be injected into the option list. */
export function buildCreateOption(label: string): string {
  return `${CREATE_OPTION_PREFIX}${label}${CREATE_OPTION_SUFFIX}`;
}

/**
 * Returns the raw label if `option` is a create sentinel, or `null` if it is a
 * real existing value. Use this to distinguish the two in `onChange` handlers.
 */
export function parseCreateOption(option: string): string | null {
  if (
    option.startsWith(CREATE_OPTION_PREFIX) &&
    option.endsWith(CREATE_OPTION_SUFFIX)
  ) {
    return option.slice(
      CREATE_OPTION_PREFIX.length,
      -CREATE_OPTION_SUFFIX.length,
    );
  }
  return null;
}
