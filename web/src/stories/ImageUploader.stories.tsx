import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import ImageUploader from "../components/ImageUploader";

/**
 * ImageUploader renders the upload trigger for adding photos to a workflow state.
 *
 * Rationale: Extracted from WorkflowState.tsx (Issue #406) to enable independent
 * testing of desktop vs mobile layouts and the loading/error states.
 *
 * Edge cases:
 * - Mobile FAB: fixed-position floating action button via Portal.
 * - Desktop button: portaled into #piece-upload-trigger on the page.
 * - Saving: spinner in button, text changes to "Saving…".
 * - Widget loading: spinner overlays button text; button is disabled.
 * - Error: error message shown below the trigger.
 */
const meta = {
  title: "Components/ImageUploader",
  component: ImageUploader,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: {
    saving: false,
    widgetLoading: false,
    uploadError: null,
    imageError: null,
    mobile: false,
    onUploadClick: fn(),
  },
};

export const DesktopSaving: Story = {
  name: "Desktop / Saving",
  args: {
    ...Desktop.args,
    saving: true,
  },
};

export const DesktopWidgetLoading: Story = {
  name: "Desktop / Widget loading",
  args: {
    ...Desktop.args,
    widgetLoading: true,
  },
};

export const DesktopUploadError: Story = {
  name: "Desktop / Upload error",
  args: {
    ...Desktop.args,
    uploadError: "Upload failed. Please try again.",
  },
};
