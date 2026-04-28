import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalEntryDialog from "../GlobalEntryDialog";
import * as api from "../../util/api";
import type { GlazeCombinationEntry } from "../../util/api";

vi.mock("../../util/api", () => ({
  createGlobalEntry: vi.fn(),
  fetchGlobalEntries: vi.fn(),
  fetchGlobalEntriesWithFilters: vi.fn(),
  toggleGlobalEntryFavorite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../CloudinaryImage", () => ({
  default: ({ url, alt }: { url: string; alt: string }) => (
    <img src={url} alt={alt} />
  ),
}));

function makeCombo(
  overrides: Partial<GlazeCombinationEntry> = {},
): GlazeCombinationEntry {
  return {
    id: "1",
    name: "Iron Red!Clear",
    test_tile_image: "",
    is_food_safe: true,
    runs: false,
    highlights_grooves: null,
    is_different_on_white_and_brown_clay: null,
    firing_temperature: null,
    is_public: true,
    is_favorite: false,
    glaze_types: [
      { id: "gt1", name: "Iron Red" },
      { id: "gt2", name: "Clear" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([makeCombo()]);
  vi.mocked(api.fetchGlobalEntries).mockImplementation((globalName) => {
    if (globalName === "glaze_type") {
      return Promise.resolve([
        { id: "gt1", name: "Iron Red", isPublic: true },
        { id: "gt2", name: "Clear", isPublic: true },
      ]);
    }
    return Promise.resolve([{ id: "loc1", name: "Studio K", isPublic: false }]);
  });
  vi.mocked(api.createGlobalEntry).mockResolvedValue({
    id: "created-id",
    name: "Studio K",
    isPublic: false,
  });
});

describe("GlobalEntryDialog", () => {
  it("renders browse results and selects an entry", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={onClose}
        onSelect={onSelect}
        canCreate
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Iron Red!Clear"));

    expect(onSelect).toHaveBeenCalledWith({
      id: "1",
      name: "Iron Red!Clear",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles favorites from the browse tab", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByLabelText("Add to favorites"));

    await waitFor(() =>
      expect(api.toggleGlobalEntryFavorite).toHaveBeenCalledWith(
        "glaze_combination",
        "1",
        true,
      ),
    );
  });

  it("creates a simple global entry from the create tab", async () => {
    const onSelect = vi.fn();

    render(
      <GlobalEntryDialog
        globalName="location"
        open
        onClose={vi.fn()}
        onSelect={onSelect}
        canCreate
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Create" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Location" }),
      "Studio K",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Location" }));

    await waitFor(() =>
      expect(api.createGlobalEntry).toHaveBeenCalledWith("location", {
        field: "name",
        value: "Studio K",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith({ id: "created-id", name: "Studio K" });
  });

  it("creates a composed entry from ordered layers", async () => {
    vi.mocked(api.createGlobalEntry).mockResolvedValue({
      id: "combo-id",
      name: "Iron Red!Clear",
      isPublic: false,
    });
    const onSelect = vi.fn();

    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={onSelect}
        canCreate
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Create" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Layer 1" }),
      "Iron",
    );
    await userEvent.click(screen.getByRole("option", { name: "Iron Red" }));
    await userEvent.click(screen.getByRole("button", { name: "Add layer" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Layer 2" }),
      "Clear",
    );
    await userEvent.click(screen.getByRole("option", { name: "Clear" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Create Glaze Combination" }),
    );

    await waitFor(() =>
      expect(api.createGlobalEntry).toHaveBeenCalledWith("glaze_combination", {
        layers: ["gt1", "gt2"],
      }),
    );
    expect(onSelect).toHaveBeenCalledWith({
      id: "combo-id",
      name: "Iron Red!Clear",
    });
  });
});
