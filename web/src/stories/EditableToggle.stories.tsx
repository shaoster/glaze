import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import EditableToggle from "../components/EditableToggle";
import type { PieceDetail } from "../util/types";

/**
 * EditableToggle controls whether a piece's history can be edited.
 *
 * Rationale: Extracted from PieceDetail.tsx (Issue #406) to enable independent
 * testing of the seal/unseal flow and its disabled states.
 *
 * Edge cases:
 * - Sealed (default): shows "Edit piece history" button in dashed-outline style.
 * - Open: shows "Seal changes" contained button.
 * - Shared piece: toggle is disabled with a tooltip explaining why.
 * - Sequence error: "Seal changes" is disabled when history has a validation error.
 */
const meta = {
  title: "Components/EditableToggle",
  component: EditableToggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof EditableToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

const basePiece: PieceDetail = {
  id: "p1",
  name: "Test Vase",
  created: new Date("2026-01-01"),
  last_modified: new Date("2026-05-01"),
  photo_count: 0,
  thumbnail: null,
  shared: false,
  is_editable: false,
  can_edit: true,
  tags: [],
  current_location: "",
  showcase_story: "",
  showcase_fields: [],
  showcase_video_url: null,
  owner_alias: null,
  current_state: {
    id: "s1",
    state: "trimmed",
    notes: "",
    created: new Date("2026-05-01"),
    last_modified: new Date("2026-05-01"),
    images: [],
    previous_state: "wheel_thrown",
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
  },
  history: [],
};

export const Sealed: Story = {
  args: {
    piece: basePiece,
    onPieceUpdated: fn(),
  },
};

export const Editable: Story = {
  args: {
    piece: { ...basePiece, is_editable: true },
    onPieceUpdated: fn(),
  },
};

export const SharedPiece: Story = {
  name: "Shared (disabled)",
  args: {
    piece: { ...basePiece, shared: true },
    onPieceUpdated: fn(),
  },
};
