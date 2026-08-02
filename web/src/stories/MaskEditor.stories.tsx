import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import Button from "@mui/material/Button";
import MaskEditor from "../components/MaskEditor";

// Local story images — committed to web/public/stories/ at ≤ 280 KB each.
// The paths are served by Vite's static file middleware in dev and Storybook.
const IMAGES = [
  {
    id: "pitcher",
    label: "Tall bisque pitcher with lid",
    url: "/stories/pitcher.jpg",
    width: 900,
    height: 1200,
  },
  {
    id: "vase",
    label: "Vase with demo plant",
    url: "/stories/vase.jpg",
    width: 900,
    height: 1200,
  },
  {
    id: "dish",
    label: "Jewelry dish with jewelry",
    url: "/stories/dish.jpg",
    width: 1200,
    height: 900,
  },
  {
    id: "whiskey",
    label: "Whiskey cup with drink",
    url: "/stories/whiskey.jpg",
    width: 1005,
    height: 1200,
  },
  {
    id: "bowl",
    label: "Bowl side with hand",
    url: "/stories/bowl.jpg",
    width: 900,
    height: 1200,
  },
  {
    id: "juicer",
    label: "Wheel thrown juicer",
    url: "/stories/juicer.jpg",
    width: 1200,
    height: 900,
  },
] as const;

type ImageId = (typeof IMAGES)[number]["id"];

const meta = {
  title: "Components/MaskEditor",
  component: MaskEditor,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full-screen mask-editing dialog for #532. Six tools: pre-fill, brush+eraser, polygon edit, flood fill, GrabCut, contour snap. " +
          "GrabCut and contour snap are backed by `@opencvjs/web` (WASM in-browser). " +
          "The `onCommit` callback receives an RGBA PNG blob (RGB zeroed, alpha = foreground mask).",
      },
      inlineStories: false,
      iframeHeight: 820,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    imageUrl: { control: "text" },
    imageWidth: { control: "number" },
    imageHeight: { control: "number" },
    candidateMask: { control: "text" },
  },
} satisfies Meta<typeof MaskEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---- Wrapper that adds a launch button (MaskEditor is a Dialog) ----
function MaskEditorLauncher(
  props: React.ComponentProps<typeof MaskEditor> & { buttonLabel?: string },
) {
  const [open, setOpen] = useState(false);
  const { buttonLabel = "Open MaskEditor", ...rest } = props;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#211b19",
        }}
      >
        <Button variant="contained" onClick={() => setOpen(true)}>
          {buttonLabel}
        </Button>
      </div>
      <MaskEditor
        {...rest}
        open={open}
        onCancel={() => {
          setOpen(false);
          rest.onCancel?.();
        }}
        onCommit={(blob) => {
          setOpen(false);
          rest.onCommit?.(blob);
        }}
      />
    </>
  );
}

// ---- Gallery picker: one card per image, click to open editor ----
function MaskEditorGallery({
  initialImage = "pitcher",
  candidateMask,
  onCommit,
  onCancel,
}: {
  initialImage?: ImageId;
  candidateMask?: string;
  onCommit?: (blob: Blob) => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState<(typeof IMAGES)[number] | null>(
    null,
  );

  return (
    <>
      <div
        style={{
          background: "#211b19",
          minHeight: "100vh",
          padding: 32,
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <div
          style={{
            color: "oklch(0.74 0.009 70)",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          Select an image to open MaskEditor
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {IMAGES.map((img) => (
            <button
              key={img.id}
              onClick={() => setSelected(img)}
              style={{
                border: "1px solid oklch(0.36 0.011 55)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: "pointer",
                background: "oklch(0.22 0.010 55)",
                padding: 0,
                textAlign: "left",
                transition: "border-color 0.15s",
                outline:
                  initialImage === img.id
                    ? "2px solid oklch(0.70 0.12 40)"
                    : "none",
                outlineOffset: 2,
              }}
            >
              <img
                src={img.url}
                alt={img.label}
                style={{
                  width: "100%",
                  aspectRatio: `${img.width} / ${img.height}`,
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div
                style={{
                  padding: "8px 10px",
                  fontSize: 11,
                  color: "oklch(0.74 0.009 70)",
                  lineHeight: 1.3,
                }}
              >
                {img.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <MaskEditor
          open
          imageUrl={selected.url}
          imageWidth={selected.width}
          imageHeight={selected.height}
          candidateMask={candidateMask}
          onCommit={(blob) => {
            setSelected(null);
            onCommit?.(blob);
          }}
          onCancel={() => {
            setSelected(null);
            onCancel?.();
          }}
        />
      )}
    </>
  );
}

// ================================================================
// Stories
// ================================================================

/** Click any pottery image to open the full MaskEditor. */
export const Gallery: Story = {
  render: (args) => (
    <MaskEditorGallery
      onCommit={args.onCommit}
      onCancel={args.onCancel}
    />
  ),
  args: {
    onCommit: fn(),
    onCancel: fn(),
    imageUrl: IMAGES[0].url,
    imageWidth: IMAGES[0].width,
    imageHeight: IMAGES[0].height,
  },
};

/** Pitcher pre-opened — tall bisque pot with adjacent lid. */
export const Pitcher: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Pitcher with lid"
    />
  ),
  args: {
    imageUrl: IMAGES[0].url,
    imageWidth: IMAGES[0].width,
    imageHeight: IMAGES[0].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};

/** Vase with plant — tests background clutter handling. */
export const VaseWithPlant: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Vase with plant"
    />
  ),
  args: {
    imageUrl: IMAGES[1].url,
    imageWidth: IMAGES[1].width,
    imageHeight: IMAGES[1].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};

/** Jewelry dish — landscape orientation, small subject. */
export const JewelryDish: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Jewelry dish"
    />
  ),
  args: {
    imageUrl: IMAGES[2].url,
    imageWidth: IMAGES[2].width,
    imageHeight: IMAGES[2].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};

/** Whiskey cup — glass/ceramic combo, translucent areas. */
export const WhiskeyCup: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Whiskey cup"
    />
  ),
  args: {
    imageUrl: IMAGES[3].url,
    imageWidth: IMAGES[3].width,
    imageHeight: IMAGES[3].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};

/** Bowl with hand in frame — tests multi-subject masking. */
export const BowlWithHand: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Bowl with hand"
    />
  ),
  args: {
    imageUrl: IMAGES[4].url,
    imageWidth: IMAGES[4].width,
    imageHeight: IMAGES[4].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};

/** Wheel thrown juicer — landscape, complex undercut geometry. */
export const WheelThrownJuicer: Story = {
  render: (args) => (
    <MaskEditorLauncher
      {...args}
      buttonLabel="Open — Wheel thrown juicer"
    />
  ),
  args: {
    imageUrl: IMAGES[5].url,
    imageWidth: IMAGES[5].width,
    imageHeight: IMAGES[5].height,
    onCommit: fn(),
    onCancel: fn(),
  },
};
