import type { Meta, StoryObj } from "@storybook/react";
import PiecePhotoGalleryGrid from "../components/PiecePhotoGalleryGrid";
import { fn } from "@storybook/test";

/**
 * PiecePhotoGalleryGrid is a non-interactive layout component for displaying a set of piece images.
 * 
 * Rationale:
 * - Decoupled from the interactive gallery to allow for simple read-only display.
 * - Optimized for different viewing contexts (e.g. mobile vs desktop).
 * 
 * Edge cases:
 * - Single Image: Occupies full width of the container.
 * - Even/Odd counts: Adjusts grid spacing to maintain balance.
 */
const meta = {
  title: "Components/PiecePhotoGalleryGrid",
  component: PiecePhotoGalleryGrid,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PiecePhotoGalleryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockImages = [
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400",
    caption: "Early stage",
  },
  {
    url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400",
    caption: "After trimming",
  },
  {
    url: "https://images.unsplash.com/photo-1593150501174-d8200671607f?w=400",
    caption: "Bisque fired",
  },
];

export const Default: Story = {
  args: {
    images: mockImages,
    onImageClick: fn(),
  },
};

export const SingleImage: Story = {
  args: {
    images: [mockImages[0]],
    onImageClick: fn(),
  },
};
