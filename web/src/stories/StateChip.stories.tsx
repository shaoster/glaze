import type { Meta, StoryObj } from "@storybook/react-vite";
import StateChip from "../components/StateChip";

const meta = {
  title: "Components/StateChip",
  component: StateChip,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof StateChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentState: Story = {
  args: {
    state: "glazed",
    label: "Glazed",
    variant: "current",
    isTerminal: false,
  },
};

export const PastState: Story = {
  args: {
    state: "bisque_fired",
    label: "Bisque Fired",
    variant: "past",
    isTerminal: false,
  },
};

export const FutureState: Story = {
  args: {
    state: "glaze_fired",
    label: "Glaze Fired",
    variant: "future",
    isTerminal: false,
    onClick: () => {},
  },
};

export const Completed: Story = {
  args: {
    state: "completed",
    label: "Completed",
    variant: "current",
    isTerminal: true,
  },
};

export const Recycled: Story = {
  args: {
    state: "recycled",
    label: "Recycled",
    variant: "current",
    isTerminal: true,
  },
};

export const MutedCurrent: Story = {
  args: {
    state: "glazed",
    label: "Glazed",
    variant: "current",
    isTerminal: false,
    muted: true,
    description: "Muted during timeline rewind",
  },
};

export const DisabledFuture: Story = {
  args: {
    state: "glaze_fired",
    label: "Glaze Fired",
    variant: "future",
    isTerminal: false,
    disabled: true,
    onClick: () => {},
  },
};
