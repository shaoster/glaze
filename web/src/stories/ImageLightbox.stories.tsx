import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ImageLightbox from "../components/ImageLightbox";
import type { CaptionedImage } from "../util/types";

const sampleImages: CaptionedImage[] = [
  {
    id: "img1",
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Celadon glaze before firing",
    cloudinary_public_id: null,
    cloud_name: null,
    crop: null,
  },
  {
    id: "img2",
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Detail of the rim",
    cloudinary_public_id: null,
    cloud_name: null,
    crop: null,
  },
  {
    id: "img3",
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: null,
    cloudinary_public_id: null,
    cloud_name: null,
    crop: null,
  },
];

const meta = {
  title: "Components/ImageLightbox",
  component: ImageLightbox,
  parameters: { layout: "fullscreen" },
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
