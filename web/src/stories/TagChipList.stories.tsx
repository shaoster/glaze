import type { Meta, StoryObj } from "@storybook/react";
import TagChipList from "../components/TagChipList";
import React from "react";

/**
 * TagChipList renders an array of tags with built-in overflow handling.
 * 
 * Rationale:
 * - Implemented to prevent tag clouds from breaking layouts in dense areas (e.g. PieceList cards).
 * - Provides a "Show more" affordance to expand the full set of tags inline.
 * 
 * Edge cases:
 * - Forced Visibility: Ensures certain high-priority tags (e.g. current selection) remain visible 
 *   even when the list is collapsed.
 * - Empty List: Renders nothing to save vertical space.
 * - Single Tag: No overflow button appears.
 */
const meta = {
  title: "Components/TagChipList",
  component: TagChipList,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TagChipList>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockTags = [
  { id: "t1", name: "porcelain", color: "#f0f0f0", is_public: false },
  { id: "t2", name: "reduction", color: "#8a5a3a", is_public: true },
  { id: "t3", name: "wheel-thrown", color: "#a0a0a0", is_public: false },
  { id: "t4", name: "studio-sale", color: "#c97a4d", is_public: false },
  { id: "t5", name: "commission", color: "#8ca6a3", is_public: true },
];

export const Default: Story = {
  args: {
    tags: mockTags,
  },
};

export const Collapsed: Story = {
  args: {
    tags: mockTags,
    maxVisible: 2,
  },
};

export const WithForcedVisibility: Story = {
  args: {
    tags: mockTags,
    maxVisible: 2,
    alwaysVisibleTagIds: ["t5"],
  },
};
