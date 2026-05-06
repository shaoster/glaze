import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkflowSummary from "../WorkflowSummary";
import type { PieceState } from "../../util/types";

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "0.0.2",
    states: [
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        past_friendly_name: "Thrown",
        description: "Thrown.",
        successors: ["trimmed"],
        fields: {
          clay_weight_lbs: { type: "number", label: "Clay weight" },
        },
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        past_friendly_name: "Trimmed",
        description: "Trimmed.",
        successors: ["completed"],
        fields: {
          trimmed_weight_lbs: { type: "number", label: "Trimmed weight" },
        },
      },
      {
        id: "waxed",
        visible: true,
        friendly_name: "Waxing",
        past_friendly_name: "Waxed",
        description: "Waxed.",
        successors: ["completed"],
      },
      {
        id: "completed",
        visible: true,
        friendly_name: "Completed",
        past_friendly_name: "Completed",
        description: "Done.",
        terminal: true,
        summary: {
          sections: [
            {
              title: "Making",
              fields: [
                { label: "Starting weight", value: "wheel_thrown.clay_weight_lbs" },
                {
                  label: "Trimming loss",
                  compute: {
                    op: "difference",
                    left: "wheel_thrown.clay_weight_lbs",
                    right: "trimmed.trimmed_weight_lbs",
                    unit: "lb",
                    decimals: 2,
                  },
                },
                {
                  label: "Wax resist",
                  text: "Not recorded",
                  when: { state_missing: "waxed" },
                },
              ],
            },
          ],
        },
      },
    ],
  },
}));

function makeState(
  state: string,
  additionalFields: Record<string, unknown> = {},
): PieceState {
  return {
    state,
    notes: "",
    images: [],
    additional_fields: additionalFields,
    created: new Date("2026-01-01T00:00:00Z"),
    last_modified: new Date("2026-01-01T00:00:00Z"),
  } as PieceState;
}

describe("WorkflowSummary", () => {
  it("renders direct values, computed values, and conditional text", () => {
    render(
      <WorkflowSummary
        stateId="completed"
        history={[
          makeState("wheel_thrown", { clay_weight_lbs: 4 }),
          makeState("trimmed", { trimmed_weight_lbs: 3.25 }),
          makeState("completed"),
        ]}
      />,
    );

    expect(screen.getByText("Making")).toBeInTheDocument();
    expect(screen.getByText("Starting weight")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Trimming loss")).toBeInTheDocument();
    expect(screen.getByText("0.75 lb")).toBeInTheDocument();
    expect(screen.getByText("Wax resist")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });

  it("honors state_exists and state_missing visibility", () => {
    render(
      <WorkflowSummary
        stateId="completed"
        history={[
          makeState("wheel_thrown", { clay_weight_lbs: 4 }),
          makeState("trimmed", { trimmed_weight_lbs: 3.25 }),
          makeState("waxed"),
          makeState("completed"),
        ]}
      />,
    );

    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
  });
});
