import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShowcaseVideoInputPicker, {
  type ShowcaseVideoInputSelection,
} from "../components/ShowcaseVideoInputPicker";
import type { PieceDetail } from "../util/types";
import { DEFAULT_TRACK_ID } from "../util/music";

/**
 * ShowcaseVideoInputPicker lets a potter exclude individual images and notes
 * before generating a Keepsake summary video.
 *
 * Rationale:
 * - Added in PR #748 as the minimal customization surface for the Piece Showcase
 *   video flow.
 * - The picker needs to preserve the "included by default" behavior while
 *   allowing per-item exclusions that later feed deterministic generation.
 *
 * Edge cases:
 * - Empty history: the picker should gracefully show that no images or notes are
 *   available.
 * - Pre-existing exclusions: the checkboxes should reflect saved state.
 * - Mixed content: image and note counts should remain independent.
 */
const basePiece: PieceDetail = {
  id: "p1",
  name: "Keepsake Bowl",
  created: new Date("2026-05-01"),
  last_modified: new Date("2026-05-15"),
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
    id: "s3",
    state: "completed",
    notes: "Finished and ready for the shelf. The glaze pooled softly around the rim.",
    created: new Date("2026-05-15"),
    last_modified: new Date("2026-05-15"),
    images: [
      {
        url: "/thumbnails/bowl.svg",
        caption: "Final glaze pass",
        created: new Date("2026-05-15"),
        image_id: "img-current",
        cropped_url: null,
        r2_key: null,
        crop_task_failed: false,
      },
      {
        url: "/thumbnails/bowl.svg",
        caption: "Detail of rim sheen",
        created: new Date("2026-05-15"),
        image_id: "img-rim",
        cropped_url: null,
        r2_key: null,
        crop_task_failed: false,
      },
    ],
    previous_state: "glaze_fired",
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
  },
  history: [
    {
      id: "s1",
      state: "wheel_thrown",
      notes: "Started on the wheel with a fresh lump of clay.",
      created: new Date("2026-05-01"),
      last_modified: new Date("2026-05-01"),
      images: [
      {
        url: "/thumbnails/question-mark.svg",
        caption: "Fresh form",
        created: new Date("2026-05-01"),
        image_id: "img-wheel",
        cropped_url: null,
        r2_key: null,
        crop_task_failed: false,
      },
      ],
      previous_state: "designed",
      next_state: "trimmed",
      custom_fields: {},
      has_been_edited: false,
    },
    {
      id: "s2",
      state: "trimmed",
      notes: "Trimmed the base and cleaned up the foot ring once the clay stiffened.",
      created: new Date("2026-05-10"),
      last_modified: new Date("2026-05-10"),
      images: [
      {
        url: "/thumbnails/question-mark.svg",
        caption: "Foot ring after trimming",
        created: new Date("2026-05-10"),
        image_id: "img-trimmed",
        cropped_url: null,
        r2_key: null,
        crop_task_failed: false,
      },
      ],
      previous_state: "wheel_thrown",
      next_state: "glaze_fired",
      custom_fields: {},
      has_been_edited: false,
    },
    {
      id: "s3",
      state: "completed",
      notes: "Finished and ready for the shelf.",
      created: new Date("2026-05-15"),
      last_modified: new Date("2026-05-15"),
      images: [
      {
        url: "/thumbnails/bowl.svg",
        caption: "Final glaze pass",
        created: new Date("2026-05-15"),
        image_id: "img-current",
        cropped_url: null,
        r2_key: null,
        crop_task_failed: false,
      },
      ],
      previous_state: "glaze_fired",
      next_state: null,
      custom_fields: {},
      has_been_edited: false,
    },
  ],
};

function ShowcaseVideoInputPickerPreview({
  piece,
  initialSelection,
}: {
  piece: PieceDetail;
  initialSelection: ShowcaseVideoInputSelection;
}) {
  const [selection, setSelection] = useState(initialSelection);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ShowcaseVideoInputPicker
        piece={piece}
        selection={selection}
        onSelectionChange={setSelection}
      />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Components/ShowcaseVideoInputPicker",
  component: ShowcaseVideoInputPickerPreview,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ShowcaseVideoInputPickerPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    piece: basePiece,
    initialSelection: {
      excludedImageKeys: [],
      excludedNoteKeys: [],
      musicTrackId: DEFAULT_TRACK_ID,
    },
  },
  render: (args) => <ShowcaseVideoInputPickerPreview {...args} />,
};

export const WithExclusions: Story = {
  args: {
    piece: basePiece,
    initialSelection: {
      excludedImageKeys: ["s1:img-wheel"],
      excludedNoteKeys: ["s1"],
      musicTrackId: DEFAULT_TRACK_ID,
    },
  },
  render: (args) => <ShowcaseVideoInputPickerPreview {...args} />,
};

export const LockedThumbnail: Story = {
  args: {
    piece: {
      ...basePiece,
      thumbnail: {
        url: "/thumbnails/bowl.svg",
        crop_task_failed: false,
      },
    },
    initialSelection: {
      excludedImageKeys: ["s3:img-current"],
      excludedNoteKeys: [],
      musicTrackId: DEFAULT_TRACK_ID,
    },
  },
  render: (args) => <ShowcaseVideoInputPickerPreview {...args} />,
};

export const EmptyHistory: Story = {
  args: {
    piece: {
      ...basePiece,
      history: [],
      current_state: {
        ...basePiece.current_state,
        notes: "",
        images: [],
      },
    },
    initialSelection: {
      excludedImageKeys: [],
      excludedNoteKeys: [],
      musicTrackId: DEFAULT_TRACK_ID,
    },
  },
  render: (args) => <ShowcaseVideoInputPickerPreview {...args} />,
};
