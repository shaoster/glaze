import type { Meta, StoryObj } from "@storybook/react";
import DeletePiecePhotoDialog from "../components/DeletePiecePhotoDialog";
import { fn } from "@storybook/test";
import { useState } from "react";
import Button from "@mui/material/Button";

/**
 * DeletePiecePhotoDialog is a confirmation modal for image removal.
 * 
 * Rationale:
 * - Provides a destructive action safety net (Issue #288).
 * - Styled with "error" theme colors to signal the severity of the action.
 * 
 * Edge cases:
 * - Deleting state: Disables buttons and shows a loading state on the confirm button.
 * - Backdrop click: Prevented during deletion to avoid accidental dismissal.
 */
const meta = {
  title: "Components/DeletePiecePhotoDialog",
  component: DeletePiecePhotoDialog,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 300,
      canvas: { sourceState: "none" },
      source: { code: null },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: { table: { disable: true } },
  },
  render: (args) => <DeletePiecePhotoDialogWithState {...args} />,
} satisfies Meta<typeof DeletePiecePhotoDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function DeletePiecePhotoDialogWithState(args: React.ComponentProps<typeof DeletePiecePhotoDialog>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="contained" color="error" onClick={() => setOpen(true)}>
        Open Delete Dialog
      </Button>
      <DeletePiecePhotoDialog
        {...args}
        open={open}
        onCancel={() => {
          setOpen(false);
          args.onCancel?.();
        }}
        onConfirm={() => {
          args.onConfirm?.();
          setOpen(false);
        }}
      />
    </>
  );
}

export const Default: Story = {
  args: {
    open: false,
    deleting: false,
    onCancel: fn(),
    onConfirm: fn(),
  },
};

export const Deleting: Story = {
  args: {
    ...Default.args,
    deleting: true,
  },
};
