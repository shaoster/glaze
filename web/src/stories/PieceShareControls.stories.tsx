import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ShareControls from "../components/PieceShareControls";
import type { PieceDetail } from "../util/types";

const basePiece: PieceDetail = {
  id: "abc123",
  name: "Celadon Bowl",
  shared: false,
  is_editable: false,
  can_edit: true,
  tags: [],
  showcase_fields: [],
  showcase_story: "",
  photo_count: 0,
  thumbnail: null,
  current_location: null,
  current_state: {
    id: "s1",
    state: "completed",
    notes: "",
    images: [],
    custom_fields: {},
    has_been_edited: false,
    created: new Date("2025-01-01"),
    last_modified: new Date("2025-01-02"),
    previous_state: null,
    next_state: null,
  },
  history: [],
  last_modified: new Date("2025-01-02"),
  created: new Date("2025-01-01"),
};

/**
 * PieceShareControls component for managing the public sharing status of a piece.
 *
 * Rationale: Implements the "Share to Gallery" feature, allowing users to make
 * their work public. Integrated into the PieceDetail view during the redesign (Issue #172).
 *
 * Edge cases:
 * - Permissions: Only visible/enabled if the user has `can_edit` permission.
 * - API Failure: Handles errors during the toggle transition (though mocking is handled via MSW or props).
 * - UI Feedback: Provides immediate visual feedback when the sharing state changes.
 */
const meta = {
  title: "Components/PieceShareControls",
  component: ShareControls,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { onPieceUpdated: fn() },
} satisfies Meta<typeof ShareControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotShared: Story = {
  args: { piece: basePiece },
};

export const Shared: Story = {
  args: { piece: { ...basePiece, shared: true } },
};
