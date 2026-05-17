import type { Meta, StoryObj } from "@storybook/react";
import WorkflowState from "../components/WorkflowState";
import { http, HttpResponse } from "msw";

/**
 * WorkflowState handles the data entry and image management for a single piece state.
 * 
 * Rationale:
 * - Decoupled from PieceDetail in Issue #172 to allow standalone usage and better testability.
 * - Dynamically renders fields based on UISchema fetched from the backend (Issue #210).
 * - Manages Cloudinary uploads (Issue #288) and image captions.
 * 
 * Edge cases:
 * - Read-only mode: Disables all inputs and hide save buttons.
 * - Loading schema: Shows skeleton or loading state while UISchema is being fetched.
 * - Error fetching schema: Displays an error alert with a retry affordance.
 */
const meta = {
  title: "Components/WorkflowState",
  component: WorkflowState,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof WorkflowState>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockInitialState = {
  id: "s1",
  state: "wheel_thrown",
  notes: "Thrown on the wheel with 2lbs of clay.",
  created: new Date("2026-05-01T12:00:00Z"),
  last_modified: new Date("2026-05-01T12:00:00Z"),
  images: [],
  previous_state: "designed",
  next_state: "trimmed",
  custom_fields: {
    clay_weight_lbs: 2.0,
    clay_body: "Stoneware",
  },
  has_been_edited: false,
};

export const Default: Story = {
  args: {
    initialPieceState: mockInitialState as any,
    pieceId: "p1",
    onSaved: () => {},
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/workflow/schema/wheel_thrown/", () => {
          return HttpResponse.json({
            type: "object",
            properties: {
              clay_weight_lbs: { 
                type: "number", 
                "x-label": "Clay Weight Lbs",
                "x-description": "Weight of clay in pounds."
              },
              clay_body: { 
                type: "string", 
                "x-label": "Clay Body",
                "$ref": "@clay_body.name",
                "x-can-create": true
              },
            },
          });
        }),
        http.get("/api/globals/clay_body/", () => {
          return HttpResponse.json([
            { id: "c1", name: "Stoneware", is_public: true },
            { id: "c2", name: "Porcelain", is_public: true },
          ]);
        }),
      ],
    },
  },
};

export const ReadOnly: Story = {
  args: {
    ...Default.args,
    readOnly: true,
  },
  parameters: { ...Default.parameters },
};

export const LoadingSchema: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/workflow/schema/wheel_thrown/", () => {
          return new Promise(() => {}); // Never resolves
        }),
      ],
    },
  },
};

export const SchemaError: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/workflow/schema/wheel_thrown/", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      ],
    },
  },
};
