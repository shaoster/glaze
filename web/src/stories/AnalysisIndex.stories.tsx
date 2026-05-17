import type { Meta, StoryObj } from "@storybook/react";
import AnalysisIndex from "../components/AnalysisIndex";
import { http, HttpResponse } from "msw";

/**
 * AnalysisIndex is the top-level dashboard for the Analyze tab.
 * 
 * Rationale:
 * - Implemented in Issue #371 to organize different analysis modules.
 * - Provides immediate visual feedback (summaries) for data-rich modules like Glaze Combinations.
 * 
 * Edge cases:
 * - Data Loading: Shows loading spinners in summary components.
 * - Placeholder Modules: Clearly marks future functionality that isn't implemented yet.
 */
const meta = {
  title: "Components/AnalysisIndex",
  component: AnalysisIndex,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnalysisIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockCombinationImages = [
  {
    glaze_combination: { id: "gc1", name: "Midnight Blue", is_public: true },
    pieces: [
      {
        id: "p1",
        name: "Bowl 1",
        state: "completed",
        images: [{ url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=100", caption: "Test" }],
      },
    ],
  },
  {
    glaze_combination: { id: "gc2", name: "Celadon", is_public: true },
    pieces: [
      {
        id: "p2",
        name: "Vase 1",
        state: "completed",
        images: [{ url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=100", caption: "Test" }],
      },
    ],
  },
];

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return HttpResponse.json(mockCombinationImages);
        }),
      ],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return new Promise(() => {}); // Never resolves
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};
