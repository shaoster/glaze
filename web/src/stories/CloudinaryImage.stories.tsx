import type { Meta, StoryObj } from "@storybook/react";
import CloudinaryImage from "../components/CloudinaryImage";

/**
 * CloudinaryImage is an optimized image renderer with Cloudinary integration.
 *
 * Rationale:
 * - Automatically requests size-appropriate renditions from Cloudinary.
 * - Falls back to standard `<img>` if Cloudinary metadata is missing.
 * - Prevents face-detection "zoom" by using center fill for pottery subjects (Issue #212).
 *
 * Edge cases:
 * - Missing Metadata: Renders the fallback `url` directly.
 * - Custom Crops: Applies relative cropping transformations before resizing.
 * - Contextual Sizing: Adjusts dimensions and quality based on the `context` prop.
 */
const meta = {
  title: "Components/CloudinaryImage",
  component: CloudinaryImage,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof CloudinaryImage>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_URL =
  "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800";

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
    requestedWidth: 320,
    requestedHeight: 240,
  },
};

export const WithCloudinary: Story = {
  args: {
    url: SAMPLE_URL,
    cloud_name: "glaze",
    cloudinary_public_id: "samples/pottery-1",
    context: "detail",
  },
};

export const WithCrop: Story = {
  args: {
    url: SAMPLE_URL,
    cloud_name: "glaze",
    cloudinary_public_id: "samples/pottery-1",
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
