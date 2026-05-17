import type { Meta, StoryObj } from "@storybook/react";
import NavigationBlocker from "../components/NavigationBlocker";
import { fn } from "@storybook/test";
import { useState } from "react";
import Button from "@mui/material/Button";
import React from "react";

/**
 * NavigationBlocker is a confirmation dialog that prevents accidental loss of data.
 * 
 * Rationale:
 * - Implemented to support dirty-state protection across complex forms (Issue #245).
 * - Standardizes the warning UI for unsaved changes.
 * 
 * Edge cases:
 * - No data router: While this component just renders a Dialog, it is typically used 
 *   in conjunction with `useBlocker` from `react-router-dom`.
 */
const meta = {
  title: "Components/NavigationBlocker",
  component: NavigationBlocker,
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
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="contained" onClick={() => setOpen(true)}>
          Simulate Unsaved Navigation
        </Button>
        <NavigationBlocker
          {...args}
          open={open}
          onStay={() => {
            setOpen(false);
            args.onStay?.();
          }}
          onLeave={() => {
            setOpen(false);
            args.onLeave?.();
          }}
        />
      </>
    );
  },
} satisfies Meta<typeof NavigationBlocker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onStay: fn(),
    onLeave: fn(),
  },
};
