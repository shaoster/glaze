import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalEntryField from "../GlobalEntryField";

vi.mock("../GlobalEntryDialog", () => ({
  default: () => null,
}));

describe("GlobalEntryField", () => {
  it("clears the selected entry from the chip delete action", async () => {
    const onSelect = vi.fn();

    render(
      <GlobalEntryField
        globalName="location"
        label="Current location"
        value="Studio Shelf"
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByTestId("CancelIcon"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("disables the chip delete action when disabled", () => {
    render(
      <GlobalEntryField
        globalName="location"
        label="Current location"
        value="Studio Shelf"
        onSelect={vi.fn()}
        disabled
      />,
    );

    expect(screen.queryByTestId("CancelIcon")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change Current location" }),
    ).toBeDisabled();
  });
});
