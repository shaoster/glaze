import type { Meta, StoryObj } from "@storybook/react";
import ProcessSummary from "../components/ProcessSummary";
import type { PieceDetail, PieceState } from "../util/types";

// Minimal history simulating the typical pottery workflow:
// designed → trimmed → bisque_fired → glazed → glaze_fired → completed
const history: PieceState[] = [
  {
    id: "s1",
    state: "designed",
    notes: "Planning a celadon bowl",
    images: [],
    custom_fields: { clay_type: "porcelain", weight_grams: 500 },
    has_been_edited: false,
    created: new Date("2025-01-01"),
    last_modified: new Date("2025-01-01"),
    previous_state: null,
    next_state: null,
  },
  {
    id: "s2",
    state: "bisque_fired",
    notes: "",
    images: [],
    custom_fields: { kiln_temperature: 1000 },
    has_been_edited: false,
    created: new Date("2025-01-10"),
    last_modified: new Date("2025-01-10"),
    previous_state: null,
    next_state: null,
  },
  {
    id: "s3",
    state: "glaze_fired",
    notes: "",
    images: [],
    custom_fields: { kiln_temperature: 1260, weight_grams: 460 },
    has_been_edited: false,
    created: new Date("2025-01-20"),
    last_modified: new Date("2025-01-20"),
    previous_state: null,
    next_state: null,
  },
];

const piece = {
  id: "piece-1",
  name: "Celadon Bowl",
  created: new Date("2025-01-01"),
  last_modified: new Date("2025-01-20"),
  photo_count: 0,
  thumbnail: null,
  shared: false,
  is_editable: false,
  can_edit: true,
  current_state: history[history.length - 1],
  current_location: "",
  tags: [],
  showcase_story: "",
  showcase_fields: [],
  showcase_video_url: null,
  owner_alias: null,
  history,
} satisfies PieceDetail;

/**
 * ProcessSummary component providing a high-level timeline of a piece's history.
 *
 * Rationale: Designed to give users a quick overview of the pottery lifecycle,
 * summarizing transitions between states (e.g., from 'bisque_fired' to 'glaze_fired').
 *
 * Edge cases:
 * - Empty history: Displays a placeholder or empty state message.
 * - Long history: Handles multiple states gracefully, though usually limited to workflow steps.
 * - Custom fields: Summaries often prioritize specific fields (weight, temperature) based on the state.
 */
const meta = {
  title: "Components/ProcessSummary",
  component: ProcessSummary,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ProcessSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHistory: Story = {
  args: { piece, history },
};

export const EmptyHistory: Story = {
  args: {
    piece: { ...piece, history: [], current_state: history[0] },
    history: [],
  },
};
