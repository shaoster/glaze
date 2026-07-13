import type { Meta, StoryObj } from "@storybook/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { http, HttpResponse } from "msw";
import RoutedGlobalEntryField from "../components/RoutedGlobalEntryField";

/**
 * RoutedGlobalEntryField wraps `GlobalEntryField` with URL-driven open/tab
 * state via `useGlobalFieldRouting`, so the browse/create dialog for a
 * workflow global field is deep-linkable at
 * `/pieces/:id/state/fields/:fieldName[/new]`.
 *
 * Rationale:
 * - `fieldName` defaults to `globalName` but must be set explicitly when two
 *   fields on the same state reference the same global (e.g. both
 *   `current_location` and `kiln_location` reference the `location` global) —
 *   otherwise both fields would share one URL slot and open in lockstep.
 * - Falls back to the plain, unrouted `GlobalEntryField` when rendered
 *   outside a Router context (`useInRouterContext()` is false), which is how
 *   the same field components stay usable embedded in Django admin forms.
 * - An inner component (`RoutedGlobalEntryFieldInner`) keeps
 *   `useGlobalFieldRouting` unconditional even though the router check
 *   happens in the outer default export — hooks can't be called conditionally.
 *
 * Edge cases:
 * - Landing directly on `/pieces/:id/state/fields/:fieldName` opens the
 *   dialog on mount with the "browse" tab selected.
 * - Landing on the `/new` suffix opens directly to the "create" tab.
 * - Rendered with no ancestor Router (e.g. mounted standalone in Django
 *   admin) it silently drops routing and behaves like a plain `GlobalEntryField`.
 */
const meta = {
  title: "Components/RoutedGlobalEntryField",
  component: RoutedGlobalEntryField,
  parameters: {
    layout: "centered",
    noGlobalRouter: true,
  },
  tags: ["autodocs"],
} satisfies Meta<typeof RoutedGlobalEntryField>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockHandlers = [
  http.get("/api/globals/location/", () =>
    HttpResponse.json([
      { id: "l1", name: "Studio Shelf A", is_public: false },
      { id: "l2", name: "Kiln Room", is_public: false },
    ]),
  ),
];

function withMemoryRouter(initialPath: string) {
  return [
    (Story: React.ComponentType) => {
      const router = createMemoryRouter(
        [{ path: "/pieces/:id/*", element: <Story /> }],
        { initialEntries: [initialPath] },
      );
      return <RouterProvider router={router} />;
    },
  ];
}

export const Closed: Story = {
  args: {
    pieceId: "p1",
    globalName: "location",
    label: "Location",
    value: "",
    onSelect: () => {},
  },
  decorators: withMemoryRouter("/pieces/p1"),
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const OpenFromUrlBrowseTab: Story = {
  args: {
    ...Closed.args,
  },
  decorators: withMemoryRouter("/pieces/p1/state/fields/location"),
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const OpenFromUrlCreateTab: Story = {
  args: {
    ...Closed.args,
    canCreate: true,
  },
  decorators: withMemoryRouter("/pieces/p1/state/fields/location/new"),
  parameters: {
    msw: {
      handlers: [
        ...mockHandlers,
        http.post("/api/globals/location/", () =>
          HttpResponse.json({ id: "l3", name: "New Location", is_public: false }),
        ),
      ],
    },
  },
};

export const DisambiguatedFieldName: Story = {
  args: {
    pieceId: "p1",
    globalName: "location",
    fieldName: "kiln_location",
    label: "Kiln Location",
    value: "",
    onSelect: () => {},
  },
  decorators: withMemoryRouter("/pieces/p1/state/fields/kiln_location"),
  parameters: {
    msw: { handlers: mockHandlers },
  },
};

export const OutsideRouterFallsBackToPlainField: Story = {
  args: {
    pieceId: "p1",
    globalName: "location",
    label: "Location (no Router ancestor, e.g. Django admin)",
    value: "",
    onSelect: () => {},
  },
  // No router decorator: exercises the useInRouterContext() === false fallback.
  parameters: {
    msw: { handlers: mockHandlers },
  },
};
