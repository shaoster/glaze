import {
  DETECT_OCR_LABEL_WHITE_THRESHOLD,
  DETECT_OCR_TEXT_DARK_THRESHOLD,
} from "../ocrDetection";
import type { OcrSuggestion, OcrTuning, ParsedFields } from "./glazeImportToolTypes";

export const COMBO_NAME_SEPARATOR = "!";

export const DEFAULT_PARSED_FIELDS: ParsedFields = {
  name: "",
  kind: "glaze_type",
  first_glaze: "",
  second_glaze: "",
  runs: false,
  is_food_safe: true,
};

export const DEFAULT_OCR_TUNING: OcrTuning = {
  labelWhiteThreshold: DETECT_OCR_LABEL_WHITE_THRESHOLD,
  textDarkThreshold: DETECT_OCR_TEXT_DARK_THRESHOLD,
};

const RUNS_RE = /caution\W{0,10}runs/i;
const NOT_FOOD_SAFE_RE = /not\s+food[\s-]?safe/i;

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sanitizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectRunsFromOcrText(text: string): true | null {
  return RUNS_RE.test(text) ? true : null;
}

export function detectFoodSafeFromOcrText(text: string): false | null {
  return NOT_FOOD_SAFE_RE.test(text) ? false : null;
}

const STRUCTURED_FIRST_RE = /st\s*[GgCcSs][lI1]aze\s*[:;]\s*(.+)/;
const STRUCTURED_SECOND_RE = /nd\s*[GgCcSs][lI1]aze\s*[:;]\s*(.+)/;

export function parseOcrSuggestion(
  text: string,
  fallbackKind: ParsedFields["kind"],
): OcrSuggestion {
  const cleaned = sanitizeOcrText(text);
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z]/.test(line));

  let structuredFirst: string | null = null;
  let structuredSecond: string | null = null;
  for (const line of lines) {
    const firstMatch = STRUCTURED_FIRST_RE.exec(line);
    if (firstMatch) structuredFirst = titleCaseWords(firstMatch[1].trim());
    const secondMatch = STRUCTURED_SECOND_RE.exec(line);
    if (secondMatch) structuredSecond = titleCaseWords(secondMatch[1].trim());
  }
  if (structuredFirst !== null || structuredSecond !== null) {
    const first = structuredFirst ?? "";
    const second = structuredSecond ?? "";
    const isCombo = structuredFirst !== null && structuredSecond !== null;
    return {
      rawText: cleaned,
      suggestedName: isCombo
        ? `${first}${COMBO_NAME_SEPARATOR}${second}`
        : first || second,
      suggestedKind: isCombo ? "glaze_combination" : fallbackKind,
      suggestedFirstGlaze: first,
      suggestedSecondGlaze: second,
      confidence: null,
    };
  }

  const nameLines = lines.filter(
    (line) => !RUNS_RE.test(line) && !NOT_FOOD_SAFE_RE.test(line),
  );
  const bestLine =
    [...nameLines].sort(
      (a, b) =>
        b.replace(/[^A-Za-z]/g, "").length - a.replace(/[^A-Za-z]/g, "").length,
    )[0] || "";
  const normalized = bestLine
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*!\s*/g, "!")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
  const comboTokens = normalized
    .split(/!|\/|&|\+|\bover\b/gi)
    .map((token) =>
      titleCaseWords(
        token
          .replace(/[^A-Za-z\s-]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      ),
    )
    .filter(Boolean);
  const isCombo = comboTokens.length >= 2;

  const suggestedName = isCombo
    ? comboTokens.join(COMBO_NAME_SEPARATOR)
    : titleCaseWords(
        nameLines
          .join(" ")
          .replace(/[^A-Za-z0-9!\s/-]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      );

  return {
    rawText: cleaned,
    suggestedName,
    suggestedKind: isCombo ? "glaze_combination" : fallbackKind,
    suggestedFirstGlaze: comboTokens[0] || "",
    suggestedSecondGlaze: comboTokens[1] || "",
    confidence: null,
  };
}
