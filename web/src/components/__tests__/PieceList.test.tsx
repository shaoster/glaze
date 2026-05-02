import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceList from "../PieceList";
import type { PieceSummary } from "../../util/types";

vi.mock("../CloudinaryImage", () => ({
  default: ({ url, alt }: { url: string; alt?: string }) => (
    <img src={url} alt={alt ?? ""} />
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

describe("PieceList", () => {
  describe("with no pieces", () => {
    it("renders an empty grid", () => {
      renderPieceList([]);
      const container = screen.getByRole("rowgroup")!;
      expect(container.children).toHaveLength(0);
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
      renderPieceList([makePiece()]);
      const imgs = screen.getAllByRole("presentation");
      expect(
        imgs.some(
          (img) => img.getAttribute("src") === "https://example.com/bowl.jpg",
        ),
      ).toBe(true);
    });

    it("name cell links to piece detail page", async () => {
      renderPieceList([makePiece()]);
      const link = screen.getByRole("navigation", { name: "Clay Bowl" });
      expect(link.getAttribute("href")).toBe(
        "/pieces/aaaaaaaa-0000-0000-0000-000000000001",
      );
    });

    it("renders tags as chips", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "tag-1", name: "Gift", color: "#2A9D8F" },
            { id: "tag-2", name: "Functional", color: "#E76F51" },
          ],
        }),
      ]);
      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("Functional")).toBeInTheDocument();
    });

    it("renders a piece card without tag chips when the piece has no tags", () => {
      renderPieceList([makePiece({ tags: [] })]);
      const pieceCard = screen.getByRole("navigation", { name: "Clay Bowl" });
      expect(within(pieceCard).queryByText("Gift")).not.toBeInTheDocument();
      expect(
        within(pieceCard).queryByRole("button", { name: /\+\d+ more/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("with multiple pieces", () => {
    it("renders a row for each piece", () => {
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

    it("renders each piece in its own table row", () => {
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" },
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "glazed" },
        }),
      ];
      renderPieceList(pieces);
      const rows = screen.getAllByRole("row");
      expect(within(rows[0]).getByText("Bowl")).toBeInTheDocument();
      expect(within(rows[0]).getByText("Designing")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Mug")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Glazing")).toBeInTheDocument();
    });
  });

  describe("filter toolbar", () => {
    it("renders + filter and + tag dashed buttons", () => {
      renderPieceList([]);
      expect(
        screen.getByRole("button", { name: /add status filter/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /add tag filter/i }),
      ).toBeInTheDocument();
    });

    it("autocomplete is not visible until + filter is clicked", () => {
      renderPieceList([]);
      expect(screen.queryByLabelText("Status filters")).not.toBeInTheDocument();
    });

    it("shows the filter autocomplete when + filter is clicked", async () => {
      const user = userEvent.setup();
      renderPieceList([]);
      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      expect(screen.getByLabelText("Status filters")).toBeInTheDocument();
    });

    it("shows the tag autocomplete when + tag is clicked", async () => {
      const user = userEvent.setup();
      renderPieceList([]);
      await user.click(screen.getByRole("button", { name: /add tag filter/i }));
      expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    });

    it("shows all pieces when no filter is selected", () => {
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("filters to work in progress pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Work in Progress" }));
      await user.keyboard("{Escape}");

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
      expect(screen.getAllByText("Work in Progress").length).toBeGreaterThan(0);
    });

    it("filters to completed pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Completed" }));
      await user.keyboard("{Escape}");

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
    });

    it("filters to discarded pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Discarded" }));
      await user.keyboard("{Escape}");

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("supports combining multiple filters", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Completed" }));
      await user.click(screen.getByRole("option", { name: "Discarded" }));
      await user.keyboard("{Escape}");

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("shows all pieces again when a filter chip is removed", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add status filter/i }));
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Completed" }));
      await user.keyboard("{Escape}");
      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();

      // Deselect the option to clear the filter (Popper is still open after Escape)
      await user.click(screen.getByLabelText("Status filters"));
      await user.click(screen.getByRole("option", { name: "Completed" }));
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
            { id: "gift", name: "Gift", color: "#2A9D8F" },
            { id: "sale", name: "For Sale", color: "#4FC3F7" },
          ],
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
        }),
      ];
      renderPieceList(pieces);

      await user.click(screen.getByRole("button", { name: /add tag filter/i }));
      await user.click(screen.getByLabelText("Tags"));
      await user.click(screen.getByRole("option", { name: "Gift" }));
      await user.click(screen.getByLabelText("Tags"));
      await user.click(screen.getByRole("option", { name: "For Sale" }));
      await user.keyboard("{Escape}");

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
    });

    it("collapses piece tags behind an expand button when there are many", async () => {
      const user = userEvent.setup();
      renderPieceList([
        makePiece({
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F" },
            { id: "sale", name: "For Sale", color: "#4FC3F7" },
            { id: "sold", name: "Sold", color: "#F4A261" },
            { id: "blue", name: "Blue", color: "#457B9D" },
          ],
        }),
      ]);

      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("For Sale")).toBeInTheDocument();
      expect(screen.getByText("Sold")).toBeInTheDocument();
      expect(screen.queryByText("Blue")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "+1 more" }));

      expect(screen.getByText("Blue")).toBeInTheDocument();
    });

    it("keeps currently filtered tags visible even when piece tags are collapsed", async () => {
      const user = userEvent.setup();
      renderPieceList([
        makePiece({
          id: "id-1",
          name: "Bowl",
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F" },
            { id: "sale", name: "For Sale", color: "#4FC3F7" },
            { id: "sold", name: "Sold", color: "#F4A261" },
            { id: "blue", name: "Blue", color: "#457B9D" },
          ],
        }),
      ]);

      await user.click(screen.getByRole("button", { name: /add tag filter/i }));
      await user.click(screen.getByLabelText("Tags"));
      await user.click(screen.getByRole("option", { name: "Blue" }));
      await user.keyboard("{Escape}");

      const pieceCard = screen.getByRole("navigation", { name: "Bowl" });
      expect(within(pieceCard).getByText("Blue")).toBeInTheDocument();
    });
  });

  describe("sort selector", () => {
    it("does not render the sort selector when onSortChange is not provided", () => {
      renderPieceList([]);
      expect(screen.queryByLabelText("Sort order")).not.toBeInTheDocument();
    });

    it("renders a sort selector when onSortChange is provided", () => {
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

      await user.click(screen.getByLabelText("Sort order"));
      await user.click(screen.getByRole("option", { name: "Name A → Z" }));

      await waitFor(() => {
        expect(onSortChange).toHaveBeenCalledWith("name");
      });
    });
  });
});
