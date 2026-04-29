import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import PieceHistory from "../PieceHistory";
import type { PieceState } from "../../util/types";

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "test",
    globals: {},
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: [],
        past_friendly_name: "Designed",
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: [],
        past_friendly_name: "Wheel Thrown",
      },
    ],
  },
}));

function makeState(overrides: Partial<PieceState> = {}): PieceState {
  return {
    state: "designed",
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    additional_fields: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PieceHistory", () => {
  it("renders nothing when there are no past states", () => {
    const { container } = render(
      <PieceHistory
        pastHistory={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the history toggle button when there is history", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
        />,
      );
    });
    expect(
      screen.getByRole("button", { name: /show history/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Show history' button by default (not 'Hide history')", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({ state: "designed" }),
            makeState({ state: "wheel_thrown" }),
          ]}
        />,
      );
    });
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide history/i })).not.toBeInTheDocument();
  });

  it("toggling shows and hides the history panel", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByRole("button", { name: /hide history/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide history/i }));
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
  });

  it("shows past state labels and timestamps when open", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", notes: "Test note" })]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("Designed")).toBeInTheDocument();
    expect(screen.getByText(/Test note/)).toBeInTheDocument();
  });

  it("does not render image thumbnails in the history list", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({
              state: "designed",
              images: [
                {
                  url: "http://example.com/img1.jpg",
                  caption: "First",
                  created: new Date(),
                  cloudinary_public_id: null,
                },
              ],
            }),
          ]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /view image/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
