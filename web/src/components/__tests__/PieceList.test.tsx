import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceList from "../PieceList";
import type { PieceSummary } from "../../util/types";

vi.mock("../CloudinaryImage", () => ({
  default: ({ url, alt }: { url: string; alt?: string }) => (
    <img src={url} alt={alt ?? ""} />
  ),
}));

vi.mock("masonic", () => ({
  Masonry: ({
    items,
    render: RenderComponent,
    itemKey,
  }: {
    items: PieceSummary[];
    render: React.ComponentType<{ data: PieceSummary; index: number; width: number }>;
    itemKey?: (item: PieceSummary, index: number) => string | number;
  }) => (
    <div data-testid="piece-grid">
      {items.map((item, index) => (
        <div
          key={itemKey ? itemKey(item, index) : index}
          data-key={itemKey ? itemKey(item, index) : index}
        >
          <RenderComponent data={item} index={index} width={240} />
        </div>
      ))}
    </div>
  ),
}));

function makePiece(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Clay Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-02-20T12:00:00Z"),
    thumbnail: {
      url: "https://example.com/bowl.jpg",
      cloudinary_public_id: null,
      cloud_name: null,
    },
    current_location: null,
    current_state: { state: "designed" } as any,
    tags: [],
    shared: false,
    can_edit: true,
    ...overrides,
  };
}

function renderPieceList(pieces: PieceSummary[]) {
  const router = createMemoryRouter(
    [{ path: "/", element: <PieceList pieces={pieces} /> }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

// Open the condensed filter panel
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /toggle filters/i }));
}

describe("PieceList", () => {
  describe("with no pieces", () => {
    it("renders the piece count as 0", () => {
      renderPieceList([]);
      expect(screen.getByText(/· 0 pieces/)).toBeInTheDocument();
    });
  });

  describe("with one piece", () => {
    it("renders the piece name", () => {
      renderPieceList([makePiece()]);
      expect(screen.getByText("Clay Bowl")).toBeInTheDocument();
    });

    it("renders the current state", () => {
      renderPieceList([
        makePiece({ current_state: { state: "bisque_fired" } }),
      ]);
      expect(screen.getByText("Planning → Glaze")).toBeInTheDocument();
    });

    it("renders the thumbnail image with correct src", () => {
      const { container } = renderPieceList([makePiece()]);
      const imgs = container.querySelectorAll("img");
      expect(
        Array.from(imgs).some(
          (img) => img.getAttribute("src") === "https://example.com/bowl.jpg",
        ),
      ).toBe(true);
    });

    it("card links to piece detail page", () => {
      renderPieceList([makePiece()]);
      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe(
        "/pieces/aaaaaaaa-0000-0000-0000-000000000001",
      );
    });

    it("renders tags as chips", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "tag-1", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "tag-2", name: "Functional", color: "#E76F51", is_public: false },
          ],
        }),
      ]);
      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("Functional")).toBeInTheDocument();
    });

    it("renders a piece card without tag chips when the piece has no tags", () => {
      renderPieceList([makePiece({ tags: [] })]);
      expect(screen.queryByRole("button", { name: /\+\d+/i })).not.toBeInTheDocument();
    });
  });

  describe("with multiple pieces", () => {
    it("renders a card for each piece", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl" }),
        makePiece({ id: "id-2", name: "Mug" }),
        makePiece({ id: "id-3", name: "Vase" }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("shows the state chip label on each card", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "glazed" } as any }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Designing")).toBeInTheDocument();
      expect(screen.getByText("Glazing")).toBeInTheDocument();
    });

    it("passes stable piece ids to the masonry renderer as item keys", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Tagged Bowl", tags: [{ id: "tag-1", name: "Gift", color: "#2A9D8F", is_public: false }] }),
        makePiece({ id: "id-2", name: "Plain Mug", tags: [] }),
      ];

      const { container } = renderPieceList(pieces);
      const wrappers = container.querySelectorAll('[data-testid="piece-grid"] > div');

      expect(wrappers[0]?.getAttribute("data-key")).toBe("id-1");
      expect(wrappers[1]?.getAttribute("data-key")).toBe("id-2");
    });
  });

  describe("filter toolbar", () => {
    it("renders the condensed filter toggle button", () => {
      renderPieceList([]);
      expect(
        screen.getByRole("button", { name: /toggle filters/i }),
      ).toBeInTheDocument();
    });

    it("filter panel is not expanded on initial render", () => {
      renderPieceList([]);
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });

    it("expands the filter panel when the toggle is clicked", async () => {
      const user = userEvent.setup();
      renderPieceList([]);
      await openFilters(user);
      expect(screen.getByText("Active")).toBeVisible();
    });

    it("shows all pieces when no filter is selected", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("filters to work in progress pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      // Click the "Active" chip inside the filter panel
      const activeChip = screen.getAllByText("Active").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(activeChip!.closest('[role="button"]')!);

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
    });

    it("filters to completed pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(completedChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
    });

    it("filters to recycled pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const recycledChip = screen.getAllByText("Recycled").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(recycledChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("supports combining multiple filters", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      const recycledChip = screen.getAllByText("Recycled").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(completedChip!.closest('[role="button"]')!);
      await user.click(recycledChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("shows all pieces again when a filter chip is toggled off", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      // Activate filter
      await user.click(completedChip!.closest('[role="button"]')!);
      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();

      // Deactivate filter
      await user.click(completedChip!.closest('[role="button"]')!);
      await waitFor(() => {
        expect(screen.getByText("Bowl")).toBeInTheDocument();
      });
      expect(screen.getByText("Mug")).toBeInTheDocument();
    });
  });

  describe("tag filtering", () => {
    it("filters pieces to those matching all selected tags", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "sale", name: "For Sale", color: "#4FC3F7", is_public: false },
          ],
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          tags: [{ id: "gift", name: "Gift", color: "#2A9D8F", is_public: false }],
        }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      // Open the tag picker then select a tag (picker auto-closes after selection)
      await user.click(screen.getByRole("button", { name: /\+ tag/i }));
      await user.click(screen.getByLabelText("Filter by tag"));
      await user.click(screen.getByRole("option", { name: "Gift" }));
      // Gift is now an active chip; open the picker again for the second tag
      await user.click(screen.getByRole("button", { name: /\+ tag/i }));
      await user.click(screen.getByLabelText("Filter by tag"));
      await user.click(screen.getByRole("option", { name: "For Sale" }));

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
    });

    it("shows at most 2 tag chips per card with a dashed overflow chip", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "sale", name: "For Sale", color: "#4FC3F7", is_public: false },
            { id: "sold", name: "Sold", color: "#F4A261", is_public: false },
            { id: "blue", name: "Blue", color: "#457B9D", is_public: false },
          ],
        }),
      ]);

      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("For Sale")).toBeInTheDocument();
      expect(screen.queryByText("Sold")).not.toBeInTheDocument();
      expect(screen.queryByText("Blue")).not.toBeInTheDocument();
      // Overflow chip shows +2
      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("sort selector", () => {
    it("does not render the sort selector when onSortChange is not provided", () => {
      renderPieceList([]);
      expect(screen.queryByLabelText("Sort order")).not.toBeInTheDocument();
    });

    it("renders a sort selector when onSortChange is provided", async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: (
              <PieceList
                pieces={[]}
                sortOrder="-last_modified"
                onSortChange={vi.fn()}
              />
            ),
          },
        ],
        { initialEntries: ["/"] },
      );
      render(<RouterProvider router={router} />);
      // Sort selector lives inside the expandable panel
      await openFilters(user);
      expect(screen.getByLabelText("Sort order")).toBeInTheDocument();
    });

    it("calls onSortChange when a new sort option is selected", async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: (
              <PieceList
                pieces={[]}
                sortOrder="-last_modified"
                onSortChange={onSortChange}
              />
            ),
          },
        ],
        { initialEntries: ["/"] },
      );
      render(<RouterProvider router={router} />);

      // Open filter panel so the sort selector is interactable
      await openFilters(user);
      await user.click(screen.getByLabelText("Sort order"));
      await user.click(screen.getByRole("option", { name: "Name A → Z" }));

      await waitFor(() => {
        expect(onSortChange).toHaveBeenCalledWith("name");
      });
    });
  });

  describe("loading states", () => {
    it("dims the existing list during replace-style refreshes", () => {
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: <PieceList pieces={[makePiece()]} loading />,
          },
        ],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);

      expect(screen.getByTestId("piece-list-content").getAttribute("style")).toContain(
        "opacity: 0.42",
      );
      expect(screen.getByTestId("piece-list-overlay").getAttribute("style")).not.toContain(
        "background-color: transparent",
      );
    });

    it("keeps append pagination undimmed while showing the overlay spinner", () => {
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: <PieceList pieces={[makePiece()]} loadingMore />,
          },
        ],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);

      expect(screen.getByTestId("piece-list-content").getAttribute("style")).toContain(
        "opacity: 1",
      );
      expect(screen.getByTestId("piece-list-overlay").getAttribute("style")).toContain(
        "background-color: transparent",
      );
    });
  });
});
