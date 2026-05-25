import type { Meta, StoryObj } from "@storybook/react";
import StateTransition from "../components/StateTransition";
import { fn } from "@storybook/test";

/**
 * StateTransition visualizes and controls the progression of a piece through its workflow.
 *
 * Rationale:
 * - Provides a clear, branched visualization of potential next states.
 * - Enforces the "one-way" nature of state transitions by sealing historical data.
 * - Handles branching paths (e.g. standard workflow vs. recycled).
 *
 * Edge cases:
 * - Disabled Mode: Prevents transitions when the piece is in an "editable" historical mode (Issue #387).
 * - Terminal State: Hides the branching connector and next-state chips when the piece is finished.
 * - Transitioning: Disables chips while an API call is in progress to prevent race conditions.
 */
const meta = {
  title: "Components/StateTransition",
  component: StateTransition,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StateTransition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentStateName: "wheel_thrown",
    onTransition: fn(),
  },
};

export const Branching: Story = {
  args: {
    currentStateName: "trimmed",
    onTransition: fn(),
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
    disabledHint: "Seal history edit mode before transitioning...",
  },
};

export const Transitioning: Story = {
  args: {
    ...Default.args,
    transitioning: true,
  },
};

export const Terminal: Story = {
  args: {
    currentStateName: "completed",
    onTransition: fn(),
  },
};
