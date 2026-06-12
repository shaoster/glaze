import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import LightboxFooter from "../components/LightboxFooter";
import type { PiecePhotoGalleryImage } from "../components/PiecePhotoGallery";

/**
 * LightboxFooter renders the control bar at the bottom of the ImageLightbox.
 *
 * Rationale: Extracted from PiecePhotoGallery.tsx (Issue #406) to own caption
 * editing, photo-move, and thumbnail-setting state independently of the gallery
 * route logic.
 *
 * Edge cases:
 * - Read-only: onSaveCaption is null; caption and move buttons are disabled.
 * - Caption editing: inline TextField replaces the caption chip.
 * - Move menu: lists other states the photo can be moved to.
 * - No caption: shows an "Add caption" button placeholder.
 * - Thumbnail: icon button highlighted when image is the current thumbnail.
 */
const meta = {
  title: "Components/LightboxFooter",
  component: LightboxFooter,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  tags: ["autodocs"],
} satisfies Meta<typeof LightboxFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

const activeImage: PiecePhotoGalleryImage = {
  url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
  caption: "",
  crop: null,
  cropped_url: null,
  r2_key: null,
  crop_task_failed: false,
  image_id: "img1",
  stateLabel: "Trimmed",
  stateId: "s1",
  editableCurrentStateIndex: 0,
};

const pieceStates = [
  { id: "s1", label: "Trimmed" },
  { id: "s2", label: "Bisque fired" },
  { id: "s3", label: "Glaze fired" },
];

export const Default: Story = {
  args: {
    activeImage,
    onSaveCaption: fn(),
    pieceStates,
    moveImageFn: fn(),
    onPieceUpdated: fn(),
    onMoveSuccess: fn(),
    isCurrentThumbnail: false,
    cropAvailable: true,
    onCrop: fn(),
    onSetAsThumbnail: fn(),
  },
};

export const WithCaption: Story = {
  args: {
    ...Default.args,
    activeImage: { ...activeImage, caption: "Trimmed foot ring, 1.2lbs" },
  },
};

export const CurrentThumbnail: Story = {
  args: {
    ...Default.args,
    isCurrentThumbnail: true,
  },
};

export const ReadOnly: Story = {
  args: {
    ...Default.args,
    onSaveCaption: null,
    moveImageFn: undefined,
    onSetAsThumbnail: undefined,
  },
};
