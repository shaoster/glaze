import type { Meta, StoryObj } from "@storybook/react";
import ImageUploader from "../components/ImageUploader";
import type { ImageEntry } from "../components/workflowStateDraft";

/**
 * ImageUploader manages the full Cloudinary upload lifecycle and renders the
 * upload trigger for adding photos to a workflow state.
 *
 * Rationale: Extracted from WorkflowState.tsx (Issue #406) and refactored to
 * own its loading/error state rather than receiving it as props.
 *
 * Edge cases:
 * - Mobile FAB: fixed-position floating action button via Portal.
 * - Desktop button: portaled into #piece-upload-trigger on the page.
 * - Hidden: component is invisible but retains its DOM node (used when readOnly).
 */
const meta = {
  title: "Components/ImageUploader",
  component: ImageUploader,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  pieceId: "p1",
  initialStateId: "s1",
  notes: "",
  normalizedCustomFields: {} as Record<string, string | number | boolean | null>,
  images: [] as ImageEntry[],
  onSaved: () => {},
  dispatch: () => {},
};

export const Desktop: Story = {
  args: {
    ...baseArgs,
    mobile: false,
  },
};

export const Mobile: Story = {
  args: {
    ...baseArgs,
    mobile: true,
  },
};

export const Hidden: Story = {
  args: {
    ...baseArgs,
    mobile: false,
    hidden: true,
  },
};
