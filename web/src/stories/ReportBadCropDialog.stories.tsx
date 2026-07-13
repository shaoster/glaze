import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import Button from "@mui/material/Button";
import { http, HttpResponse, delay } from "msw";
import ReportBadCropDialog from "../components/ReportBadCropDialog";

/**
 * ReportBadCropDialog lets a user flag a piece-state image whose
 * auto-segmented crop is wrong, optionally editing the crop box and adding
 * notes before submitting a human crop run for review.
 *
 * Rationale (PR #421 — "feat: bad-crop tagging and inference-run persistence";
 * hardened in follow-ups "clarify crop vs mask flow" and "make piece-state
 * image authoritative"):
 * - `crop` fields are normalized `0..1` fractions (not pixels) so they stay
 *   valid across any image's actual resolution.
 * - Submitting posts a `crop-runs/` record for downstream model review/retraining,
 *   distinct from the crop actually applied to the image.
 *
 * Edge cases:
 * - Success: shows a confirmation `Alert` and auto-closes after 1s.
 * - Error: shows the extracted error message and keeps the dialog open with
 *   the form re-enabled so the user can retry.
 * - `open` toggling resets `notes`/`error`/`success`/`crop` back to `initialCrop`
 *   (or the full-frame default) every time the dialog reopens.
 */
const meta = {
  title: "Components/ReportBadCropDialog",
  component: ReportBadCropDialog,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 500,
      source: {
        code: `
<ReportBadCropDialog
  open={true}
  onClose={() => {}}
  pieceStateImageId={42}
  initialCrop={{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }}
/>`,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: { table: { disable: true } },
  },
  render: (args) => <ReportBadCropDialogWithState {...args} />,
} satisfies Meta<typeof ReportBadCropDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function ReportBadCropDialogWithState(
  args: React.ComponentProps<typeof ReportBadCropDialog>,
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" color="warning" onClick={() => setOpen(true)}>
        Report Bad Crop
      </Button>
      <ReportBadCropDialog
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
          args.onClose();
        }}
      />
    </>
  );
}

export const Default: Story = {
  args: {
    open: false,
    onClose: () => {},
    pieceStateImageId: 42,
    initialCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  },
  parameters: {
    msw: {
      handlers: [
        http.post("/api/crop-runs/", () =>
          HttpResponse.json({
            id: 1,
            piece_state_image_id: 42,
            crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            notes: "",
            status: "pending",
          }),
        ),
      ],
    },
  },
};

export const Submitting: Story = {
  args: { ...Default.args },
  parameters: {
    msw: {
      handlers: [
        http.post("/api/crop-runs/", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

export const SubmitFailed: Story = {
  args: { ...Default.args },
  parameters: {
    msw: {
      handlers: [
        http.post("/api/crop-runs/", () =>
          HttpResponse.json(
            { detail: "This image already has a pending crop review." },
            { status: 400 },
          ),
        ),
      ],
    },
  },
};
