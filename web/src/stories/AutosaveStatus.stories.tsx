import type { Meta, StoryObj } from "@storybook/react-vite";
import AutosaveStatus from "../components/AutosaveStatus";

/**
 * AutosaveStatus component indicating the current synchronization state of a piece's data.
 *
 * Rationale: Critical for user trust in the "no-save-button" architecture (Issue #172).
 * Shows when changes are pending, saving, or successfully persisted.
 *
 * Edge cases:
 * - Network Error: Red status with specific error message and retry hint.
 * - Floating Variant: Used in the mobile-optimized detail header.
 * - Precision: Shows "Saved at [Time]" to confirm the last successful sync.
 */
const meta = {
  title: "Components/AutosaveStatus",
  component: AutosaveStatus,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof AutosaveStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { status: "idle" },
};

export const Pending: Story = {
  args: { status: "pending" },
};

export const Saving: Story = {
  args: { status: "saving" },
};

export const Saved: Story = {
  args: { status: "saved", lastSavedAt: new Date() },
};

export const Error: Story = {
  args: { status: "error", error: "Network request failed" },
};

export const FloatingPending: Story = {
  name: "Floating / Pending",
  args: { status: "pending", variant: "floating" },
};

export const FloatingSaved: Story = {
  name: "Floating / Saved",
  args: { status: "saved", variant: "floating", lastSavedAt: new Date() },
};
