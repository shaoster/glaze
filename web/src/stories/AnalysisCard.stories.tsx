import type { Meta, StoryObj } from "@storybook/react";
import AnalysisCard from "../components/AnalysisCard";
import TimelineIcon from "@mui/icons-material/Timeline";
import React from "react";

/**
 * AnalysisCard is a navigation and summary component used on the Analyze dashboard.
 * 
 * Rationale:
 * - Introduced in Issue #371 to provide a high-level entry point for different analysis tools.
 * - Designed to be visually consistent with other dashboard cards while highlighting key metrics.
 * 
 * Edge cases:
 * - Missing Metrics: Layout handles cases where specific metric strings are not provided.
 * - Long Titles: Text is truncated or wrapped to maintain card integrity.
 */
const meta = {
  title: "Components/AnalysisCard",
  component: AnalysisCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnalysisCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Glaze Combinations",
    description: "Explore and analyze successful glaze recipes and their interactions.",
    icon: <TimelineIcon />,
    to: "/analyze/glaze-combinations",
    metrics: ["124 combinations", "15 active glazes"],
  },
};

export const WithoutMetrics: Story = {
  args: {
    title: "Simple Analysis",
    description: "A card without any specific metrics shown at the bottom.",
    icon: <TimelineIcon />,
    to: "/analyze/simple",
  },
};
