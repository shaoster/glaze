import type { Meta, StoryObj } from "@storybook/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PiecePhotoGallery, {
  PiecePhotoGalleryButton,
  type PiecePhotoGalleryImage,
} from "../components/PiecePhotoGallery";
import { fn } from "@storybook/test";

/**
 * PiecePhotoGallery manages photo display and editing for a piece.
 *
 * **URL routing state machine** (added in PR #571 / issue #569):
 *
 * | URL | State |
 * |---|---|
 * | `/pieces/:id` | PieceDetail — gallery button visible |
 * | `/pieces/:id/photos` | Gallery grid dialog open |
 * | `/pieces/:id/photos/:N` | Lightbox at index N |
 *
 * Special cases:
 * - 0 images: `/photos` immediately redirects back to `/pieces/:id`
 * - 1 image: `/photos` redirects to `/photos/0` (forward) or back to `/pieces/:id`
 *   (backward, detected via `location.state.fromLightbox`)
 *
 * In PieceDetail, `PiecePhotoGalleryButton` is rendered inside the hero on
 * mobile and `PiecePhotoGallery` (button + Dialog/Lightbox) is rendered below
 * the hero on desktop. The single `PiecePhotoGallery` instance owns all modal
 * state; the mobile button is purely a navigation affordance.
 *
 * Edge cases:
 * - Closing the lightbox sets `location.state.fromLightbox = true` so that
 *   arriving at `/photos` with 1 image redirects back to `/pieces/:id` rather
 *   than looping back to the lightbox.
 */
const meta = {
  title: "Components/PiecePhotoGallery",
  component: PiecePhotoGallery,
  parameters: {
    layout: "centered",
    docs: { inlineStories: false, iframeHeight: 600 },
  },
  tags: ["autodocs"],
  decorators: [
    (Story, context) => {
      const initialPath =
        (context.parameters.initialPath as string | undefined) ?? "/pieces/p1";
      const router = createMemoryRouter(
        [{ path: "/pieces/:id/*", element: <Story /> }],
        { initialEntries: [initialPath] },
      );
      return <RouterProvider router={router} />;
    },
  ],
} satisfies Meta<typeof PiecePhotoGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockImages: PiecePhotoGalleryImage[] = [
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Early stage",
    stateLabel: "Thrown",
    stateId: "state-thrown",
    editableCurrentStateIndex: null,
    image_id: "img-1",
    created: new Date("2024-01-01T00:00:00Z"),
    crop: null,
    cropped_url: null,
    r2_key: null,
    crop_task_failed: false,
  },
  {
    url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800",
    caption: "After trimming",
    stateLabel: "Trimmed",
    stateId: "state-trimmed",
    editableCurrentStateIndex: null,
    image_id: "img-2",
    created: new Date("2024-01-02T00:00:00Z"),
    crop: null,
    cropped_url: null,
    r2_key: null,
    crop_task_failed: false,
  },
  {
    url: "https://images.unsplash.com/photo-1490312278390-ab64016b5873?w=800",
    caption: "Glazed",
    stateLabel: "Current",
    stateId: "state-current",
    editableCurrentStateIndex: 0,
    image_id: "img-3",
    created: new Date("2024-01-03T00:00:00Z"),
    crop: null,
    cropped_url: null,
    r2_key: null,
    crop_task_failed: false,
  },
];

/** Gallery button in its default resting state at `/pieces/p1`. */
export const Default: Story = {
  args: {
    images: mockImages,
    pieceId: "p1",
    onPieceUpdated: fn(),
  },
};

/** No photos — button is disabled and shows "0 photos". */
export const Empty: Story = {
  args: {
    ...Default.args,
    images: [],
  },
};

/** Without write props the caption edit and delete controls are hidden. */
export const ReadOnly: Story = {
  args: {
    ...Default.args,
    updatePieceFn: undefined,
    updateCurrentStateFn: undefined,
  },
};

/**
 * Gallery grid dialog — URL is `/pieces/p1/photos`.
 *
 * The dialog opens immediately because the route matches the gallery path.
 * Clicking a thumbnail would navigate to `/pieces/p1/photos/:N`.
 */
export const GalleryOpen: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    initialPath: "/pieces/p1/photos",
  },
};

/**
 * Lightbox at index 0 — URL is `/pieces/p1/photos/0`.
 *
 * Entry point: hero click in PieceDetail navigates directly to this URL,
 * bypassing the gallery grid when the thumbnail is the first image.
 */
export const LightboxAtFirst: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    initialPath: "/pieces/p1/photos/0",
  },
};

/**
 * Lightbox at index 2 — URL is `/pieces/p1/photos/2`.
 *
 * The active image is the current-state photo (editableCurrentStateIndex: 0),
 * so the caption edit control and "Added in current state" label are visible.
 */
export const LightboxAtCurrentState: Story = {
  args: {
    ...Default.args,
    updateCurrentStateFn: fn().mockResolvedValue(undefined),
    currentStateNotes: "",
  },
  parameters: {
    initialPath: "/pieces/p1/photos/2",
  },
};

/**
 * Single-photo redirect — URL is `/pieces/p1/photos`.
 *
 * With exactly one image, arriving at the gallery path auto-redirects to
 * `/pieces/p1/photos/0` (lightbox). This story shows the lightbox that
 * results immediately after the redirect.
 */
export const SinglePhotoAutoLightbox: Story = {
  args: {
    ...Default.args,
    images: [mockImages[0]],
  },
  parameters: {
    initialPath: "/pieces/p1/photos/0",
  },
};

/**
 * `PiecePhotoGalleryButton` — the pill button in isolation.
 *
 * Used inside the hero image on mobile in PieceDetail. It navigates to the
 * gallery URL; the single `PiecePhotoGallery` instance (rendered below the
 * hero, always mounted) owns the Dialog and Lightbox.
 */
export const ButtonStandalone: StoryObj<typeof PiecePhotoGalleryButton> = {
  render: (args) => {
    const router = createMemoryRouter(
      [
        {
          path: "/pieces/:id/*",
          element: <PiecePhotoGalleryButton {...args} />,
        },
      ],
      { initialEntries: ["/pieces/p1"] },
    );
    return <RouterProvider router={router} />;
  },
  args: {
    images: mockImages,
    pieceId: "p1",
  },
};
