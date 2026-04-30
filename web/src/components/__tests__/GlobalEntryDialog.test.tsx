import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("../../util/workflow", () => ({
  formatWorkflowFieldLabel: (value: string) =>
    value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  getFilterableFields: (globalName: string) =>
    globalName === "glaze_combination"
      ? [
          { name: "is_food_safe", type: "boolean", label: "Food safe?" },
          { name: "runs", type: "boolean", label: "Runs?" },
        ]
      : [],
  getGlobalComposeFrom: (globalName: string) =>
    globalName === "glaze_combination"
      ? {
          glaze_types: {
            global: "glaze_type",
            ordered: true,
            filter_label: "Contains glaze types (all must match)",
          },
        }
      : undefined,
  getGlobalDisplayField: () => "name",
  getGlobalPickerFilters: (globalName: string) =>
    globalName === "glaze_combination"
      ? [
          {
            optionsGlobalName: "glaze_type",
            label: "Contains glaze types (all must match)",
            multiple: true,
            paramKey: "glaze_type_ids",
            entryKey: "glaze_types",
          },
          {
            optionsGlobalName: "firing_temperature",
            label: "Firing Temperature",
            multiple: false,
            paramKey: "firing_temperature_id",
            entryKey: "firing_temperature",
          },
        ]
      : [],
  getGlobalThumbnailField: (globalName: string) =>
    globalName === "glaze_combination" ? "test_tile_image" : null,
  isFavoritableGlobal: (globalName: string) => globalName === "glaze_combination",
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
    test_tile_image: { url: "https://example.com/test-tile.jpg", cloudinary_public_id: null },
    is_food_safe: true,
    runs: false,
    highlights_grooves: null,
    is_different_on_white_and_brown_clay: null,
    firing_temperature: { id: "ft1", name: "Cone 6" },
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
    if (globalName === "firing_temperature") {
      return Promise.resolve([
        { id: "ft1", name: "Cone 6", isPublic: true },
        { id: "ft2", name: "Low Fire", isPublic: true },
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

  it("shows an error when toggling favorites fails", async () => {
    vi.mocked(api.toggleGlobalEntryFavorite).mockRejectedValueOnce(
      new Error("nope"),
    );

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
      expect(
        screen.getByText("Failed to update favorite. Please try again."),
      ).toBeInTheDocument(),
    );
  });

  it("shows only favorite entries when Only favorites is toggled", async () => {
    vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
      makeCombo({ id: "fav", name: "Favorite Combo", is_favorite: true }),
      makeCombo({ id: "other", name: "Other Combo", is_favorite: false }),
    ]);

    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Favorite Combo")).toBeInTheDocument(),
    );
    expect(screen.getByText("Other Combo")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Only favorites" }));

    expect(screen.getByText("Favorite Combo")).toBeInTheDocument();
    expect(screen.queryByText("Other Combo")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Only favorites" }));

    expect(screen.getByText("Favorite Combo")).toBeInTheDocument();
    expect(screen.getByText("Other Combo")).toBeInTheDocument();
  });

  it("shows an error when browse entries fail to load", async () => {
    vi.mocked(api.fetchGlobalEntriesWithFilters).mockRejectedValueOnce(
      new Error("network"),
    );

    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Failed to load entries. Please try again."),
      ).toBeInTheDocument(),
    );
  });

  it("filters browse results after selecting a multi-select autocomplete option", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenCalledWith(
        "glaze_combination",
        {},
      ),
    );

    await userEvent.type(
      screen.getByRole("combobox", {
        name: "Contains glaze types (all must match)",
      }),
      "Iron",
    );
    await userEvent.click(screen.getByRole("option", { name: "Iron Red" }));

    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenLastCalledWith(
        "glaze_combination",
        { glaze_type_ids: "gt1" },
      ),
    );
  });

  it("filters browse results after selecting a single-select autocomplete option", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await userEvent.type(
      screen.getByRole("combobox", { name: "Firing Temperature" }),
      "Cone",
    );
    await userEvent.click(screen.getByRole("option", { name: "Cone 6" }));

    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenLastCalledWith(
        "glaze_combination",
        { firing_temperature_id: "ft1" },
      ),
    );
  });

  it("filters browse results after toggling a boolean checkbox", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const foodSafeControls = screen.getByText("Food safe?").parentElement;
    if (!foodSafeControls) {
      throw new Error("expected Food safe? controls");
    }

    await userEvent.click(
      within(foodSafeControls).getByRole("checkbox", { name: "Yes" }),
    );

    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenLastCalledWith(
        "glaze_combination",
        { is_food_safe: "true" },
      ),
    );
  });

  it("filters browse results after toggling a boolean No checkbox", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const runsControls = screen.getByText("Runs?").parentElement;
    if (!runsControls) {
      throw new Error("expected Runs? controls");
    }

    await userEvent.click(
      within(runsControls).getByRole("checkbox", { name: "No" }),
    );

    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenLastCalledWith(
        "glaze_combination",
        { runs: "false" },
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

  it("shows an error when simple entry creation fails", async () => {
    vi.mocked(api.createGlobalEntry).mockRejectedValueOnce(new Error("nope"));

    render(
      <GlobalEntryDialog
        globalName="location"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
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
      expect(
        screen.getByText("Failed to create location."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Create Location" })).toBeEnabled();
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

  it("disables removing the last glaze-combination layer row", async () => {
    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
        canCreate
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Create" }));

    const removeButton = screen.getByRole("button", { name: "Remove" });
    expect(removeButton).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Layer 1" })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Layer 2" }),
    ).not.toBeInTheDocument();
  });

  it("removes a layer row before creating a composed entry", async () => {
    vi.mocked(api.createGlobalEntry).mockResolvedValue({
      id: "combo-id",
      name: "Iron Red",
      isPublic: false,
    });

    render(
      <GlobalEntryDialog
        globalName="glaze_combination"
        open
        onClose={vi.fn()}
        onSelect={vi.fn()}
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

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await userEvent.click(removeButtons[1]);
    await userEvent.click(
      screen.getByRole("button", { name: "Create Glaze Combination" }),
    );

    await waitFor(() =>
      expect(api.createGlobalEntry).toHaveBeenCalledWith("glaze_combination", {
        layers: ["gt1"],
      }),
    );
  });
});
