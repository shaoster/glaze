import type { Meta, StoryObj } from "@storybook/react";
import PiecePhotoGallery from "../components/PiecePhotoGallery";
import { fn } from "@storybook/test";

/**
 * PiecePhotoGallery is the interactive image management area for a piece.
 * 
 * Rationale:
 * - Unifies image display, upload, and deletion into a single consistent area.
 * - Supports "Set as Thumbnail" to choose the representative image for the piece.
 * - Integrates with ImageLightbox for full-screen viewing.
 * 
 * Edge cases:
 * - Empty Gallery: Shows an upload affordance or placeholder.
 * - Many Images: Uses a responsive grid that adjusts based on container width.
 * - Uploading: Shows progress indicators for in-flight Cloudinary uploads.
 */
const meta = {
  title: "Components/PiecePhotoGallery",
  component: PiecePhotoGallery,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PiecePhotoGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockImages = [
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Early stage",
    cloudinary_public_id: "test1",
    cloud_name: "glaze",
    stateLabel: "Thrown",
    stateId: "state-1",
    editableCurrentStateIndex: null,
  },
  {
    url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800",
    caption: "After trimming",
    cloudinary_public_id: "test2",
    cloud_name: "glaze",
    stateLabel: "Trimmed",
    stateId: "state-2",
    editableCurrentStateIndex: null,
  },
];

export const Default: Story = {
  args: {
    images: mockImages,
    pieceId: "p1",
    onPieceUpdated: fn(),
  },
};

export const Empty: Story = {
  args: {
    ...Default.args,
    images: [],
  },
};

export const ReadOnly: Story = {
  args: {
    ...Default.args,
    updatePieceFn: undefined,
  },
};
