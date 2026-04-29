import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import StateTransition from "../StateTransition";

const { mockWorkflow } = vi.hoisted(() => ({
  mockWorkflow: {
    version: "test",
    globals: {},
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: ["wheel_thrown", "handbuilt"],
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: ["trimmed", "recycled"],
      },
      {
        id: "handbuilt",
        visible: true,
        friendly_name: "Handbuilding",
        description: "Handbuilt.",
        successors: ["recycled"],
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        description: "Trimmed.",
        successors: ["recycled"],
      },
      {
        id: "glaze_fired",
        visible: true,
        friendly_name: "Touching Up",
        description: "Glaze fired.",
        successors: ["sanded", "completed", "recycled"],
      },
      {
        id: "completed",
        visible: true,
        friendly_name: "Completed",
        description: "Completed.",
        terminal: true,
      },
      {
        id: "recycled",
        visible: true,
        friendly_name: "Recycled",
        description: "Recycled.",
        terminal: true,
      },
    ],
  },
}));

vi.mock("../../../workflow.yml", () => ({ default: mockWorkflow }));

const TEST_THEME = createTheme({
  transitions: {
    create: () => "none",
    duration: {
      shortest: 0,
      shorter: 0,
      short: 0,
      standard: 0,
      complex: 0,
      enteringScreen: 0,
      leavingScreen: 0,
    },
  },
});

function renderTransition(
  currentStateName: string,
  onTransition = vi.fn(),
  props: Partial<{
    disabled: boolean;
    transitioning: boolean;
    transitionError: string | null;
  }> = {},
) {
  return render(
    <ThemeProvider theme={TEST_THEME}>
      <StateTransition
        currentStateName={currentStateName}
        onTransition={onTransition}
        {...props}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StateTransition", () => {
  it("renders current state chip and successor buttons", () => {
    renderTransition("designed");
    const stateFlow = screen.getByRole("group", { name: "State flow" });
    expect(within(stateFlow).getByText("Designing")).toBeInTheDocument();
    expect(within(stateFlow).getByRole("button", { name: "Throwing" })).toBeInTheDocument();
    expect(within(stateFlow).getByRole("button", { name: "Handbuilding" })).toBeInTheDocument();
  });

  it("renders completed before recycled at the end of the successor list", () => {
    renderTransition("glaze_fired");
    const stateFlow = screen.getByRole("group", { name: "State flow" });
    const buttons = within(stateFlow).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Sanding", "Completed", "Recycled"]);
  });

  it("shows no successor buttons for terminal states", () => {
    renderTransition("completed");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("clicking a successor opens the confirmation dialog", () => {
    renderTransition("designed");
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    expect(screen.getByText("Confirm State Transition")).toBeInTheDocument();
    expect(screen.getAllByText(/Designing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Throwing/).length).toBeGreaterThan(0);
  });

  it("cancelling the dialog closes it without calling onTransition", async () => {
    renderTransition("designed");
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Confirm State Transition")).not.toBeInTheDocument();
  });

  it("confirming calls onTransition with the target state", async () => {
    const onTransition = vi.fn();
    renderTransition("designed", onTransition);
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onTransition).toHaveBeenCalledWith("wheel_thrown");
  });

  it("successor buttons are disabled when disabled prop is true", () => {
    renderTransition("designed", vi.fn(), { disabled: true });
    expect(screen.getByRole("button", { name: "Throwing" })).toBeDisabled();
  });

  it("shows unsaved changes hint when disabled", () => {
    renderTransition("designed", vi.fn(), { disabled: true });
    expect(
      screen.getByText(/Save your changes before transitioning/i),
    ).toBeInTheDocument();
  });

  it("shows transition error when provided", () => {
    renderTransition("designed", vi.fn(), {
      transitionError: "Failed to transition state.",
    });
    expect(screen.getByText("Failed to transition state.")).toBeInTheDocument();
  });

  it("successor buttons are disabled while transitioning", () => {
    renderTransition("designed", vi.fn(), { transitioning: true });
    expect(screen.getByRole("button", { name: "Throwing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Handbuilding" })).toBeDisabled();
  });
});
