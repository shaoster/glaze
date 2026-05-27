import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ShowcaseStoryEditor from "../components/ShowcaseStoryEditor";
import type { PieceDetail } from "../util/types";

/**
 * ShowcaseStoryEditor renders the Showcase section for terminal-state pieces.
 *
 * Rationale: Extracted from PieceDetail.tsx (Issue #406) to isolate autosave
 * logic for the showcase story textarea and the showcase fields placeholder.
 *
 * Edge cases:
 * - Empty story: placeholder text prompts the user to write about their piece.
 * - Existing story: textarea pre-filled from `piece.showcase_story`.
 */
const meta = {
  title: "Components/ShowcaseStoryEditor",
  component: ShowcaseStoryEditor,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ShowcaseStoryEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const basePiece: PieceDetail = {
  id: "p1",
  name: "Finished Bowl",
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
    state: "completed",
    notes: "",
    created: new Date("2026-05-01"),
    last_modified: new Date("2026-05-01"),
    images: [],
    previous_state: "glaze_fired",
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
  },
  history: [],
};

export const Empty: Story = {
  args: {
    piece: basePiece,
    onPieceUpdated: fn(),
  },
};

export const WithStory: Story = {
  args: {
    piece: {
      ...basePiece,
      showcase_story:
        "Started with 1.5lbs of B-Mix porcelain, thrown on the wheel in a single session. Trimmed the foot ring the next morning when leather-hard. Bisque fired to cone 06, then glazed with a celadon dip and fired to cone 6 in reduction.",
    },
    onPieceUpdated: fn(),
  },
};
