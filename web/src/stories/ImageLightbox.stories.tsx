import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ImageLightbox from "../components/ImageLightbox";
import type { CaptionedImage } from "../util/types";

const sampleImages: CaptionedImage[] = [
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Celadon glaze before firing",
    cloudinary_public_id: undefined,
    cloud_name: undefined,
  },
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Detail of the rim",
    cloudinary_public_id: undefined,
    cloud_name: undefined,
  },
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "",
    cloudinary_public_id: undefined,
    cloud_name: undefined,
  },
];

/**
 * ImageLightbox component for immersive full-screen image viewing.
 *
 * Rationale: Replaces standard browser image opening with a controlled,
 * themed experience. Supports captions and administrative actions like "Set as Thumbnail".
 *
 * Edge cases:
 * - Single vs. Multiple: Navigation arrows only appear when there's more than one image.
 * - Missing Captions: Layout adjusts when captions are empty or null.
 * - Large Images: Ensures images are contained within the viewport while maintaining aspect ratio.
 * - Thumbnail Action: The "Set as Thumbnail" action is only present if the callback is provided.
 */
const meta = {
  title: "Components/ImageLightbox",
  component: ImageLightbox,
  parameters: {
    layout: "fullscreen",
    docs: {
      inlineStories: false,
      iframeHeight: 800,
    },
  },
  tags: ["autodocs"],
  args: { onClose: fn() },
} satisfies Meta<typeof ImageLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleImage: Story = {
  args: {
    images: [sampleImages[0]],
    initialIndex: 0,
  },
};

export const MultipleImages: Story = {
  args: {
    images: sampleImages,
    initialIndex: 0,
  },
};

export const StartAtSecond: Story = {
  args: {
    images: sampleImages,
    initialIndex: 1,
  },
};

export const WithThumbnailAction: Story = {
  args: {
    images: sampleImages,
    initialIndex: 0,
    onSetAsThumbnail: fn(),
  },
};
