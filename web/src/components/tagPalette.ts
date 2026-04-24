export const TAG_COLOR_OPTIONS = [
  "#E76F51",
  "#F4A261",
  "#E9C46A",
  "#7CB342",
  "#2A9D8F",
  "#4FC3F7",
  "#5C6BC0",
  "#7E57C2",
  "#EC407A",
  "#D4A373",
  "#90A4AE",
  "#EF5350",
] as const;

export function pickDefaultTagColor(seed = Date.now()): string {
  const index = Math.abs(seed) % TAG_COLOR_OPTIONS.length;
  return TAG_COLOR_OPTIONS[index];
}
