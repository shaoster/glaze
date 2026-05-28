import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import PieceNameEditor from "../components/PieceNameEditor";
import type { PieceDetail } from "../util/types";
import { PieceDetailSaveStatusProvider } from "../components/PieceDetailSaveStatusContext";

/**
 * PieceNameEditor renders the piece name as an inline-editable h2 heading.
 *
 * Rationale: Extracted from PieceDetail.tsx (Issue #406) to isolate name-editing
 * state and coordinate with PieceDetailSaveStatus.
 *
 * Edge cases:
 * - Read-only: no edit icon shown when `canEdit` is false.
 * - Edit mode: TextField with save/cancel controls appears on click.
 * - Empty name: save is blocked with an error message.
 */
const meta = {
  title: "Components/PieceNameEditor",
  component: PieceNameEditor,
  decorators: [
    (Story) => (
      <PieceDetailSaveStatusProvider>
        <Story />
      </PieceDetailSaveStatusProvider>
    ),
  ],
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof PieceNameEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const basePiece: PieceDetail = {
  id: "p1",
  name: "Hand-thrown Vase",
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

export const Default: Story = {
  args: {
    piece: basePiece,
    onPieceUpdated: fn(),
  },
};

export const ReadOnly: Story = {
  args: {
    piece: { ...basePiece, can_edit: false },
    onPieceUpdated: fn(),
  },
};
