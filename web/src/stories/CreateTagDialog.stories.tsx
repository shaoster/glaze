import type { Meta, StoryObj } from "@storybook/react";
import CreateTagDialog from "../components/CreateTagDialog";
import { fn } from "@storybook/test";
import { useState } from "react";
import Button from "@mui/material/Button";

/**
 * CreateTagDialog provides a simple interface for adding new categories/tags to the system.
 * 
 * Rationale:
 * - Decoupled state management allows it to be used within different contexts (e.g. TagManager).
 * - Provides a curated set of palette colors to maintain visual harmony across the app.
 * 
 * Edge cases:
 * - Validation: Displays errors passed from the parent if creation fails (e.g. duplicate name).
 * - Character Limit: Enforces a 64-character limit on the name field.
 * - Color Selection: Visual highlighting of the active color choice.
 */
const meta = {
  title: "Components/CreateTagDialog",
  component: CreateTagDialog,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 400,
      canvas: { sourceState: "none" },
      source: { code: null },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: { table: { disable: true } },
    color: { control: "color" },
  },
  render: (args) => <CreateTagDialogWithState {...args} />,
} satisfies Meta<typeof CreateTagDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function CreateTagDialogWithState(args: React.ComponentProps<typeof CreateTagDialog>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(args.name || "");
  const [color, setColor] = useState(args.color || "#8a5a3a");
  
  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Open Create Tag Dialog
      </Button>
      <CreateTagDialog
        {...args}
        open={open}
        name={name}
        color={color}
        onNameChange={setName}
        onColorChange={setColor}
        onClose={() => {
          setOpen(false);
          args.onClose?.();
        }}
        onCreate={() => {
          args.onCreate?.();
          setOpen(false);
        }}
      />
    </>
  );
}

export const Default: Story = {
  args: {
    open: false,
    name: "",
    color: "#8a5a3a",
    error: null,
    saving: false,
    onClose: fn(),
    onNameChange: fn(),
    onColorChange: fn(),
    onCreate: fn(),
  },
};

export const WithError: Story = {
  args: {
    ...Default.args,
    name: "Existing Tag",
    error: "A tag with this name already exists.",
  },
};

export const Saving: Story = {
  args: {
    ...Default.args,
    name: "New Tag",
    saving: true,
  },
};
