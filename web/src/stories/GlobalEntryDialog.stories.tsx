import type { Meta, StoryObj } from "@storybook/react";
import GlobalEntryDialog from "../components/GlobalEntryDialog";
import { http, HttpResponse } from "msw";

/**
 * GlobalEntryDialog provides a searchable selection interface for global domain entities.
 * 
 * Rationale:
 * - Implemented in Issue #150 to replace simple dropdowns with a rich, searchable modal.
 * - Supports inline creation of new entries (Issue #185) when allowed by the workflow.
 * - Handles favorites and filtering for complex entities like Glaze Combinations (Issue #342).
 * 
 * Edge cases:
 * - Empty state: Shows a clear message when no entries match the current search filter.
 * - Inline creation: Displays a form to add a new entry if the user has permissions.
 * - Favouriting: Affords a one-click toggle to promote frequently used entries.
 */
const meta = {
  title: "Components/GlobalEntryDialog",
  component: GlobalEntryDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GlobalEntryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    globalName: "location",
    onClose: () => {},
    onSelect: () => {},
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/location/", () => {
          return HttpResponse.json([
            { id: "l1", name: "Studio Shelf A", is_public: false, is_favorite: true },
            { id: "l2", name: "Kiln Room", is_public: false, is_favorite: false },
            { id: "l3", name: "Drying Rack", is_public: false, is_favorite: false },
          ]);
        }),
      ],
    },
  },
};

export const WithCreation: Story = {
  args: {
    ...Default.args,
    canCreate: true,
  },
  parameters: { ...Default.parameters },
};

export const GlazeCombinations: Story = {
  args: {
    ...Default.args,
    globalName: "glaze_combination",
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/glaze_combination/", () => {
          return HttpResponse.json([
            { id: "gc1", name: "Midnight Blue", is_public: true, is_favorite: true },
            { id: "gc2", name: "Celadon Crackle", is_public: true, is_favorite: false },
            { id: "gc3", name: "Temmoku", is_public: true, is_favorite: true },
          ]);
        }),
      ],
    },
  },
};

export const EmptySearch: Story = {
  args: {
    ...Default.args,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/location/", () => {
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};
