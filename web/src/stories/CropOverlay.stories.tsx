import type { Meta, StoryObj } from "@storybook/react";
import CropOverlay from "../components/CropOverlay";

/**
 * CropOverlay is the image-lightbox crop editor.
 *
 * Rationale:
 * - Free-form cropping (#737): the crop box resizes in any direction with no
 *   enforced aspect ratio (react-advanced-cropper RectangleStencil, no
 *   `aspectRatio`).
 * - The crop is stored as fraction-based `ImageCrop` (independent width/height).
 *
 * These stories render the real react-advanced-cropper (not a mock), so they
 * double as an integration check that the library is wired correctly — the
 * unit tests mock the library wholesale. They load a public sample image by
 * URL.
 */
const meta = {
  title: "Components/CropOverlay",
  component: CropOverlay,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof CropOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
  onSave: async () => {},
  onCancel: () => {},
};

/** Free-form: drag any edge/corner to resize the crop box in any direction. */
export const FreeForm: Story = {
  args: {
    ...baseArgs,
    initialCrop: null,
  },
};

/** Opens seeded with an existing non-square crop (10%,10% → 50%×30%). */
export const WithInitialCrop: Story = {
  args: {
    ...baseArgs,
    initialCrop: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
  },
};
