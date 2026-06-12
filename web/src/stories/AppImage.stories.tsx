import type { Meta, StoryObj } from "@storybook/react";
import AppImage from "../components/AppImage";

/**
 * AppImage is the image renderer for R2/CDN-hosted assets.
 *
 * Rationale:
 * - Renders a standard `<img>` pointing at the stored CDN URL — no
 *   request-time transforms exist.
 * - Prefers the eagerly generated crop (`croppedUrl`) when the backend
 *   generate_cropped_image task has materialized it; falls back to the
 *   original `url` until then.
 * - Shows a centered spinner until the image load event fires.
 *
 * Edge cases:
 * - Missing croppedUrl: renders the original `url` directly.
 * - Contextual chrome: the `context` prop selects the wrapper layout
 *   (thumbnail/preview are 64×64 boxes; gallery/detail fill the container;
 *   lightbox is fit-content).
 */
const meta = {
  title: "Components/AppImage",
  component: AppImage,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AppImage>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_URL =
  "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800";
const SAMPLE_CROPPED_URL =
  "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop";

export const Thumbnail: Story = {
  args: {
    url: SAMPLE_URL,
    context: "thumbnail",
  },
};

export const Gallery: Story = {
  args: {
    url: SAMPLE_URL,
    context: "gallery",
  },
};

export const Detail: Story = {
  args: {
    url: SAMPLE_URL,
    context: "detail",
  },
};

export const WithMaterializedCrop: Story = {
  args: {
    url: SAMPLE_URL,
    croppedUrl: SAMPLE_CROPPED_URL,
    context: "thumbnail",
    crop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  },
};

export const Loading: Story = {
  args: {
    url: "https://invalid-url-for-loading-state",
    context: "thumbnail",
  },
};
