import type { Meta, StoryObj } from "@storybook/react";
import GlazeCombinationSummary from "../components/GlazeCombinationSummary";
import { http, HttpResponse } from "msw";

/**
 * GlazeCombinationSummary provides a visual preview of images for different glaze combinations.
 *
 * Rationale:
 * - Used within AnalysisCard to provide immediate visual evidence of glaze results.
 * - Dynamically fetches and aggregates images from across the library.
 *
 * Edge cases:
 * - Many Images: Limits display to 4 representative images with a "+N" overflow indicator.
 * - No Images: Renders nothing to maintain a clean dashboard.
 */
const meta = {
  title: "Components/GlazeCombinationSummary",
  component: GlazeCombinationSummary,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GlazeCombinationSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockData = [
  {
    glaze_combination: { id: "gc1", name: "Midnight Blue", is_public: true },
    pieces: [
      {
        id: "p1",
        name: "B1",
        state: "completed",
        images: [
          {
            url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=100",
            caption: "Test",
          },
        ],
      },
      {
        id: "p2",
        name: "B2",
        state: "completed",
        images: [
          {
            url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=100",
            caption: "Test",
          },
        ],
      },
    ],
  },
  {
    glaze_combination: { id: "gc2", name: "Celadon", is_public: true },
    pieces: [
      {
        id: "p3",
        name: "V1",
        state: "completed",
        images: [
          {
            url: "https://images.unsplash.com/photo-1593150501174-d8200671607f?w=100",
            caption: "Test",
          },
        ],
      },
      {
        id: "p4",
        name: "V2",
        state: "completed",
        images: [
          {
            url: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=100",
            caption: "Test",
          },
        ],
      },
    ],
  },
];

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return HttpResponse.json(mockData);
        }),
      ],
    },
  },
};

export const ManyImages: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/analysis/glaze-combination-images/", () => {
          return HttpResponse.json([
            ...mockData,
            {
              glaze_combination: {
                id: "gc3",
                name: "Tenmoku",
                is_public: true,
              },
              pieces: [
                {
                  id: "p5",
                  name: "T1",
                  state: "completed",
                  images: [
                    {
                      url: "https://images.unsplash.com/photo-1593150501174-d8200671607f?w=100",
                      caption: "Test",
                    },
                  ],
                },
              ],
            },
          ]);
        }),
      ],
    },
  },
};
