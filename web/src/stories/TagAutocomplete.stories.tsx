import type { Meta, StoryObj } from "@storybook/react";
import TagAutocomplete from "../components/TagAutocomplete";
import { fn } from "@storybook/test";

/**
 * TagAutocomplete is a specialized MUI Autocomplete for searching and creating tags.
 * 
 * Rationale:
 * - Provides a unified search interface for tags across the app.
 * - Supports inline creation of new tags when no results are found (Issue #189).
 * - Displays tag colors and public/private status during selection.
 * 
 * Edge cases:
 * - New Tag Creation: Special "Create new tag" option appears when search doesn't match.
 * - Public vs Private: Visual distinction between public (shared) and private (internal) tags.
 * - Empty Search: Helpful prompt when no tags have been created yet.
 */
const meta = {
  title: "Components/TagAutocomplete",
  component: TagAutocomplete,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TagAutocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockTags = [
  { id: "t1", name: "porcelain", color: "#f0f0f0", is_public: false },
  { id: "t2", name: "reduction", color: "#8a5a3a", is_public: true },
  { id: "t3", name: "wheel-thrown", color: "#a0a0a0", is_public: false },
];

export const Default: Story = {
  args: {
    label: "Tags",
    options: mockTags,
    value: [mockTags[0]],
    onChange: fn(),
    onCreateNew: fn(),
  },
};

export const MultiSelect: Story = {
  args: {
    ...Default.args,
    value: [mockTags[0], mockTags[1]],
  },
};

export const NoResults: Story = {
  args: {
    label: "Tags",
    options: [],
    value: [],
    onChange: fn(),
    onCreateNew: fn(),
  },
};
