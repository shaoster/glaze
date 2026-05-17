import type { Meta, StoryObj } from "@storybook/react-vite";
import TagChip from "../components/TagChip";

/**
 * TagChip component used for categorizing pieces and workflows.
 *
 * Rationale: Originally implemented for taggable workflow capability (commit 55806b3).
 * Redesigned in Issue #172 (PieceDetail redesign) to unify detail save flows and improve visual consistency.
 *
 * Edge cases:
 * - Custom colors: Ensures contrast with black text by using color-mix or direct overrides.
 * - Deletable: Includes an inline Close icon with accessibility labels and hover states.
 * - Sizes: Supports small and medium variants for different UI contexts (e.g., list vs. detail).
 */
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
