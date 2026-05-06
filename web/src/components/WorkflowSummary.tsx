import { Box, Typography } from "@mui/material";
import type { PieceState } from "../util/types";
import {
  getStateSummaryDefinition,
  type WorkflowSummaryComputeDefinition,
  type WorkflowSummaryCondition,
  type WorkflowSummaryItem,
} from "../util/workflow";

type WorkflowSummaryProps = {
  stateId: string;
  history: PieceState[];
};

type RenderedSummaryItem = {
  label: string;
  value: string;
  description?: string;
};

export default function WorkflowSummary({
  stateId,
  history,
}: WorkflowSummaryProps) {
  const sections = getStateSummaryDefinition(stateId)
    .map((section) => ({
      title: section.title,
      fields: section.fields
        .map((item) => renderSummaryItem(item, history))
        .filter((item): item is RenderedSummaryItem => item !== null),
    }))
    .filter((section) => section.fields.length > 0);

  if (sections.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {sections.map((section) => (
        <Box key={section.title}>
          <Typography
            variant="subtitle2"
            sx={{ mb: 1, color: "text.secondary", fontWeight: 700 }}
          >
            {section.title}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {section.fields.map((field) => (
              <Box
                key={`${section.title}-${field.label}-${field.value}`}
                sx={{
                  minWidth: 0,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  pt: 0.75,
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {field.label}
                </Typography>
                <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                  {field.value}
                </Typography>
                {field.description ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {field.description}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function renderSummaryItem(
  item: WorkflowSummaryItem,
  history: PieceState[],
): RenderedSummaryItem | null {
  if (!conditionMatches(item.when, history)) {
    return null;
  }
  if (item.kind === "text") {
    return item.text
      ? { label: item.label, value: item.text, description: item.description }
      : null;
  }
  if (item.kind === "value") {
    const value = getFieldValue(history, item.stateId, item.fieldName);
    const formatted = formatValue(value);
    return formatted
      ? { label: item.label, value: formatted, description: item.description }
      : null;
  }
  const value = computeValue(item.compute, history);
  return value === null
    ? null
    : {
        label: item.label,
        value: formatComputedValue(value, item.compute),
        description: item.description,
      };
}

function conditionMatches(
  condition: WorkflowSummaryCondition | undefined,
  history: PieceState[],
): boolean {
  if (!condition) {
    return true;
  }
  if (condition.state_exists) {
    return history.some((state) => state.state === condition.state_exists);
  }
  if (condition.state_missing) {
    return !history.some((state) => state.state === condition.state_missing);
  }
  return true;
}

function getFieldValue(
  history: PieceState[],
  stateId: string,
  fieldName: string,
): unknown {
  const state = [...history].reverse().find((entry) => entry.state === stateId);
  return state?.custom_fields?.[fieldName];
}

function getNumericValue(
  history: PieceState[],
  ref: string | undefined,
): number | null {
  if (!ref) {
    return null;
  }
  const [stateId, fieldName] = ref.split(".", 2);
  const value = getFieldValue(history, stateId, fieldName);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function computeValue(
  compute: WorkflowSummaryComputeDefinition,
  history: PieceState[],
): number | null {
  if (compute.op === "sum" || compute.op === "product") {
    const operands = compute.operands?.map((ref) => getNumericValue(history, ref));
    if (!operands || operands.some((value) => value === null)) {
      return null;
    }
    const numericOperands = operands as number[];
    return compute.op === "sum"
      ? numericOperands.reduce((total, value) => total + value, 0)
      : numericOperands.reduce((total, value) => total * value, 1);
  }
  if (compute.op === "difference") {
    const left = getNumericValue(history, compute.left);
    const right = getNumericValue(history, compute.right);
    return left === null || right === null ? null : left - right;
  }
  const numerator = getNumericValue(history, compute.numerator);
  const denominator = getNumericValue(history, compute.denominator);
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function formatComputedValue(
  value: number,
  compute: WorkflowSummaryComputeDefinition,
): string {
  const decimals = compute.decimals ?? 2;
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(decimals, 2),
  });
  return compute.unit ? `${formatted} ${compute.unit}` : formatted;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}
