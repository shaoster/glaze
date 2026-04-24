import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StateChip from "../StateChip";

describe("StateChip", () => {
  it("renders a non-interactive current chip with description metadata", () => {
    render(
      <StateChip
        state="designed"
        label="Designing"
        description="Dreaming it up."
        variant="current"
        isTerminal={false}
      />,
    );

    const chip = screen
      .getByText("Designing")
      .closest('[data-state="designed"]');
    expect(chip).toHaveAttribute("data-variant", "current");
    expect(chip).toHaveAttribute("title", "Dreaming it up.");
  });

  it("renders a clickable future chip", () => {
    const onClick = vi.fn();
    render(
      <StateChip
        state="glazing"
        label="Glazing"
        variant="future"
        isTerminal={false}
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Glazing" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks terminal chips in the data attributes", () => {
    render(
      <StateChip
        state="completed"
        label="Completed"
        variant="past"
        isTerminal
      />,
    );

    expect(
      screen.getByText("Completed").closest('[data-state="completed"]'),
    ).toHaveAttribute("data-terminal", "true");
  });
});
