import type { Meta, StoryObj } from "@storybook/react-vite";
import AutosaveStatus from "../components/AutosaveStatus";

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
