import type { Meta, StoryObj } from "@storybook/react";
import NewPieceDialog from "../components/NewPieceDialog";
import { http, HttpResponse } from "msw";

/**
 * NewPieceDialog is the entry point for adding new work to the Glaze library.
 * 
 * Rationale:
 * - Redesigned in Issue #165 to include a thumbnail selection gallery.
 * - Supports quick-add of location and notes (Issue #192).
 * - Enforces required name field and provides immediate feedback.
 * 
 * Edge cases:
 * - Validation error: Shows error state when attempting to submit without a name.
 * - Submitting: Displays a loading state on the Create button to prevent double-submission.
 * - Thumbnail selection: Allows picking from a set of curated SVG thumbnails.
 */
const meta = {
  title: "Components/NewPieceDialog",
  component: NewPieceDialog,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof NewPieceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    onCreated: () => {},
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/location/", () => {
          return HttpResponse.json([
            { id: "l1", name: "Studio Shelf A", is_public: false },
            { id: "l2", name: "Kiln Room", is_public: false },
          ]);
        }),
      ],
    },
  },
};

export const Submitting: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    msw: {
      handlers: [
        ...(Default.parameters as any).msw.handlers,
        http.post("/api/pieces/", () => {
          return new Promise(() => {}); // Never resolves
        }),
      ],
    },
  },
};
