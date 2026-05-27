import type { Meta, StoryObj } from "@storybook/react";
import { Box, Typography } from "@mui/material";
import SectionCard from "../components/SectionCard";

/**
 * SectionCard is the frosted-glass container used throughout PieceDetail to
 * visually group related fields into distinct sections.
 *
 * Rationale: Extracted from PieceDetail.tsx (Issue #406) to enable independent
 * reuse and visual testing.
 *
 * Edge cases:
 * - No header: renders only the content slot (e.g. the location SectionCard).
 * - Eyebrow only: small uppercase label above main heading.
 * - Title + subtitle: heading on the left, muted text on the right.
 * - Title + adornment: icon or badge slotted next to the heading.
 */
const meta = {
  title: "Components/SectionCard",
  component: SectionCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof SectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContentOnly: Story = {
  args: {
    children: <Typography variant="body2">Some content goes here.</Typography>,
  },
};

export const WithTitle: Story = {
  args: {
    title: "Process Summary",
    children: <Typography variant="body2">Content below a title.</Typography>,
  },
};

export const WithTitleAndSubtitle: Story = {
  args: {
    title: "Timeline",
    subtitle: "3 completed states",
    children: <Typography variant="body2">Timeline entries go here.</Typography>,
  },
};

export const WithEyebrow: Story = {
  args: {
    eyebrow: "Section",
    title: "Showcase",
    children: <Typography variant="body2">Showcase content.</Typography>,
  },
};

export const WithTitleAdornment: Story = {
  args: {
    title: "Notes",
    titleAdornment: (
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "warning.main",
        }}
      />
    ),
    children: <Typography variant="body2">Notes content.</Typography>,
  },
};
