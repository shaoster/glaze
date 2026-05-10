import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProcessSummary from "../ProcessSummary";
import type { PieceState } from "../../util/types";

function makeState(
  state: string,
  additionalFields: Record<string, unknown> = {},
): PieceState {
  return {
    state,
    notes: "",
    images: [],
    custom_fields: additionalFields,
    created: new Date("2026-01-01T00:00:00Z"),
    last_modified: new Date("2026-01-01T00:00:00Z"),
  } as PieceState;
}

describe("ProcessSummary", () => {
  it("renders direct values, computed values, and conditional text", () => {
    render(
      <ProcessSummary
        history={[
          makeState("wheel_thrown", {
            clay_weight_lbs: 4,
            clay_body: { id: "clay-1", name: "Speckled Buff" },
          }),
          makeState("trimmed", {
            trimmed_weight_lbs: 3.25,
          }),
          makeState("submitted_to_bisque_fire", {
            length_in: 6,
            width_in: 3,
            height_in: 2,
          }),
          makeState("completed"),
        ]}
      />,
    );

    expect(screen.getByText("Making")).toBeInTheDocument();
    expect(screen.getByText("Starting weight")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Clay body")).toBeInTheDocument();
    expect(screen.getByText("Speckled Buff")).toBeInTheDocument();
    expect(screen.getByText("Trimming loss")).toBeInTheDocument();
    expect(screen.getByText("0.75 lb")).toBeInTheDocument();
    expect(screen.getByText("Wax resist")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("Dimensions total")).toBeInTheDocument();
    expect(screen.getByText("11 in")).toBeInTheDocument();
    expect(screen.getByText("Approximate volume")).toBeInTheDocument();
    expect(screen.getByText("36 cu in")).toBeInTheDocument();
    expect(screen.getByText("Length to width ratio")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("honors state_exists and state_missing visibility", () => {
    render(
      <ProcessSummary
        history={[
          makeState("wheel_thrown", { clay_weight_lbs: 4 }),
          makeState("trimmed", { trimmed_weight_lbs: 3.25 }),
          makeState("waxed"),
          makeState("completed"),
        ]}
      />,
    );

    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });

  it("uses the latest matching state value and hides empty sections", () => {
    const { container } = render(
      <ProcessSummary
        history={[
          makeState("wheel_thrown", { clay_weight_lbs: 4 }),
          makeState("wheel_thrown", { clay_weight_lbs: "5.5" }),
          makeState("completed"),
        ]}
      />,
    );

    expect(screen.getByText("5.5")).toBeInTheDocument();
    expect(screen.queryByText("Trimming loss")).not.toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });

  it("renders nothing when a state has no summary", () => {
    const { container } = render(
    );

    expect(container).toBeEmptyDOMElement();
  });
});
