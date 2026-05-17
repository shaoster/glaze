import type { Meta, StoryObj } from "@storybook/react-vite";
import TagChip from "../components/TagChip";

const meta = {
  title: "Components/TagChip",
  component: TagChip,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof TagChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "porcelain" },
};

export const WithColor: Story = {
  args: { label: "cone 10", color: "#5a8a6e" },
};

export const Deletable: Story = {
  args: { label: "reduction", onDelete: () => {} },
};

export const ColoredDeletable: Story = {
  args: { label: "raku", color: "#8a5a3a", onDelete: () => {} },
};

export const MediumSize: Story = {
  args: { label: "stoneware", size: "medium" },
};
