import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ImageLightbox from "../components/ImageLightbox";
import type { CaptionedImage } from "../util/types";
import { useState } from "react";
import Button from "@mui/material/Button";

const sampleImages: CaptionedImage[] = [
  {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
    caption: "Celadon glaze before firing",
    cropped_url: null,
  },
  {
    url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800",
    caption: "Detail of the rim",
    cropped_url: null,
  },
  {
    url: "https://images.unsplash.com/photo-1593150501174-d8200671607f?w=800",
    caption: "Bisque fired pieces",
    cropped_url: null,
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
      source: {
        code: `
<ImageLightbox
  open={true}
  images={sampleImages}
  initialIndex={0}
  onClose={() => {}}
  onSetAsThumbnail={async (image) => console.log('Set as thumbnail:', image)}
/>`,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {},
  render: (args) => <ImageLightboxWithState {...args} />,
} satisfies Meta<typeof ImageLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

function ImageLightboxWithState(
  args: React.ComponentProps<typeof ImageLightbox>,
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Open Image Lightbox
      </Button>
      {open && (
        <ImageLightbox
          {...args}
          onClose={() => {
            setOpen(false);
            args.onClose?.();
          }}
        />
      )}
    </>
  );
}

export const SingleImage: Story = {
  args: {
    images: [sampleImages[0]],
    initialIndex: 0,
    onClose: fn(),
  },
};

export const MultipleImages: Story = {
  args: {
    images: sampleImages,
    initialIndex: 0,
    onClose: fn(),
  },
};

export const StartAtSecond: Story = {
  args: {
    images: sampleImages,
    initialIndex: 1,
    onClose: fn(),
  },
};

export const WithThumbnailAction: Story = {
  args: {
    images: sampleImages,
    initialIndex: 0,
    onClose: fn(),
    onSetAsThumbnail: fn(),
  },
};
