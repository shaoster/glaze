export type FilterCategory = "wip" | "completed" | "discarded" | "shared";

export const VALID_FILTER_CATEGORIES = new Set<FilterCategory>([
  "wip",
  "completed",
  "discarded",
  "shared",
]);

export function parseFilterParam(param: string | null): FilterCategory[] {
  if (!param) return [];
  return param
    .split(",")
    .filter((v): v is FilterCategory =>
      VALID_FILTER_CATEGORIES.has(v as FilterCategory),
    );
}

export function parseTagIdsParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").filter(Boolean);
}
