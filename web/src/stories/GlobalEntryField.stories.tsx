import type { Meta, StoryObj } from "@storybook/react";
import GlobalEntryField from "../components/GlobalEntryField";
import { fn } from "@storybook/test";
import { http, HttpResponse } from "msw";

/**
 * GlobalEntryField is a specialized input component for selecting global domain entities.
 *
 * Rationale:
 * - Refactored in Issue #396 to use TextField as base for perfect grid alignment.
 * - Integrates with GlobalEntryDialog to provide a rich search/selection experience.
 *
 * Edge cases:
 * - Disabled: Disables both the input and the "Browse/Change" action.
 * - Long Values: Uses MUI Chips to display the current selection, handling overflow gracefully.
 * - Required: Visual indication of required state.
 */
const meta = {
  title: "Components/GlobalEntryField",
  component: GlobalEntryField,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GlobalEntryField>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockHandlers = [
  http.get("/api/globals/location/", () => {
    return HttpResponse.json([
      { id: "l1", name: "Studio Shelf A", is_public: false },
      { id: "l2", name: "Kiln Room", is_public: false },
    ]);
  }),
];

export const Default: Story = {
  args: {
    globalName: "location",
    label: "Location",
    value: "",
    onSelect: fn(),
  },
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    value: "Studio Shelf A",
  },
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    value: "Kiln Room",
    disabled: true,
  },
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const WithHelperText: Story = {
  args: {
    ...Default.args,
    helperText: "Choose where this piece is currently stored.",
  },
  parameters: {
    msw: { handlers: mockHandlers },
  },
};
