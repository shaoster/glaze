import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import SelectablePhotoMasonry, {
  type SelectablePhotoItem,
} from "../components/SelectablePhotoMasonry";

/**
 * SelectablePhotoMasonry renders a checkbox-selectable CSS-column masonry
 * grid of a piece's photos across its history.
 *
 * Rationale (PR #776–781 — "showcase video UX improvements"; extended in
 * PR #827 phase 5 for direct-to-R2 uploads / `AppImage`):
 * - Built for `ShowcaseVideoInputPicker`, where a user picks which photos to
 *   include when generating a showcase video from a piece's timeline.
 * - `locked` items (typically an auto-selected cover frame) render a "Cover"
 *   badge and a disabled, tooltip-explained checkbox instead of letting the
 *   user exclude them.
 * - Uses CSS multi-column layout (`columnCount` responsive 2→5) rather than
 *   a JS masonry library, so tile heights can vary freely by aspect ratio.
 *
 * Edge cases:
 * - Empty: renders `emptyLabel` instead of the grid.
 * - `disabled`: every checkbox (including unlocked ones) is disabled, e.g.
 *   while a video is already encoding.
 */
const meta = {
  title: "Components/SelectablePhotoMasonry",
  component: SelectablePhotoMasonry,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SelectablePhotoMasonry>;

export default meta;
type Story = StoryObj<typeof meta>;

function makeItems(): SelectablePhotoItem[] {
  const specs: Array<[string, string, string, boolean]> = [
    ["mug.svg", "Designed", "May 1", false],
    ["bowl.svg", "Wheel Thrown", "May 2", false],
    ["plate.svg", "Trimmed", "May 5", false],
    ["teapot.svg", "Bisque Fired", "May 10", false],
    ["vase.svg", "Glazed", "May 12", true],
    ["question-mark.svg", "Glaze Fired", "May 20", false],
  ];
  return specs.map(([file, stateLabel, whenLabel, locked], i) => ({
    key: `photo-${i}`,
    url: `/thumbnails/${file}`,
    stateLabel,
    whenLabel,
    cropped_url: null,
    crop: null,
    checked: !locked,
    locked,
  }));
}

function MasonryHarness(args: React.ComponentProps<typeof SelectablePhotoMasonry>) {
  const [items, setItems] = useState(args.items);
  return (
    <SelectablePhotoMasonry
      {...args}
      items={items.map((item) => ({
        ...item,
        onToggle: () =>
          setItems((prev) =>
            prev.map((i) => (i.key === item.key ? { ...i, checked: !i.checked } : i)),
          ),
      }))}
    />
  );
}

export const Default: Story = {
  args: {
    items: makeItems(),
    emptyLabel: "No photos available.",
  },
  render: (args) => <MasonryHarness {...args} />,
};

export const Empty: Story = {
  args: {
    items: [],
    emptyLabel: "No photos available for this piece yet.",
  },
};

export const Disabled: Story = {
  args: {
    items: makeItems(),
    emptyLabel: "No photos available.",
    disabled: true,
  },
  render: (args) => <MasonryHarness {...args} />,
};
