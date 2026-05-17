import type { Meta, StoryObj } from "@storybook/react";
import GlazeCombinationGallery from "../components/GlazeCombinationGallery";
import { http, HttpResponse } from "msw";
import React from "react";

/**
 * GlazeCombinationGallery displays a filterable grid of glaze combinations and their resulting pieces.
 * 
 * Rationale:
 * - Implemented in Issue #371 as a dedicated view for analyzing glaze interactions.
 * - Supports filtering by specific glaze, material, or firing program.
 * 
 * Edge cases:
 * - Large Results: Uses Masonry grid for performant rendering of hundreds of combinations.
 * - Empty States: Displays a helpful message when no combinations match the filters.
 * - Loading: Shows a progress indicator while fetching combination data.
 */
const meta = {
  title: "Components/GlazeCombinationGallery",
  component: GlazeCombinationGallery,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GlazeCombinationGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockCombos = [
  {
    id: "gc1",
    name: "Midnight Blue on Stoneware",
    glaze_types: [{ id: "gt1", name: "Midnight Blue", color: "#121232" }],
    pieces: [
      {
        id: "p1",
        name: "Bowl 1",
        thumbnail: { url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=200" },
      },
    ],
  },
  {
    id: "gc2",
    name: "Celadon Crackle over Iron Luster",
    glaze_types: [
      { id: "gt2", name: "Celadon Crackle", color: "#8eb89a" },
      { id: "gt3", name: "Iron Luster", color: "#4a2c2a" },
    ],
    pieces: [
      {
        id: "p2",
        name: "Vase 1",
        thumbnail: { url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=200" },
      },
    ],
  },
];

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return HttpResponse.json(
            mockCombos.map((c) => ({
              glaze_combination: { id: c.id, name: c.name, is_public: true },
              pieces: c.pieces.map((p) => ({
                ...p,
                state: "completed",
                images: [{ url: p.thumbnail.url, caption: "" }],
              })),
            })),
          );
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
          return new Promise(() => {});
        }),
      ],
    },
  },
};
