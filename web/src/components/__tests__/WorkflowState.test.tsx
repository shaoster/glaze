import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowState from "../WorkflowState";
import type { PieceState, PieceDetail } from "../../util/types";
import * as api from "../../util/api";

const { mockWorkflow } = vi.hoisted(() => ({
  mockWorkflow: {
    version: "test",
    globals: {
      location: {
        model: "Location",
        fields: {
          name: { type: "string" },
        },
      },
      clay_body: {
        model: "ClayBody",
        fields: {
          name: { type: "string" },
        },
      },
      glaze_type: {
        model: "GlazeType",
        fields: {
          name: { type: "string" },
        },
      },
      glaze_combination: {
        model: "GlazeCombination",
        fields: {
          name: { type: "string" },
          preview_image: { type: "image", use_as_thumbnail: true },
        },
        compose_from: {
          glaze_types: {
            global: "glaze_type",
            ordered: true,
            filter_label: "Contains glaze types (all must match)",
          },
        },
      },
    },
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: ["wheel_thrown", "handbuilt"],
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: ["trimmed", "recycled"],
        fields: {
          clay_weight_grams: { type: "number", label: "Clay Weight Lbs" },
          clay_body: {
            $ref: "@clay_body.name",
            can_create: true,
          },
        },
      },
      {
        id: "handbuilt",
        visible: true,
        friendly_name: "Handbuilding",
        description: "Handbuilt.",
        successors: ["recycled"],
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        description: "Trimmed.",
        successors: ["recycled", "submitted_to_bisque_fire"],
        fields: {
          trimmed_weight_grams: { type: "number", label: "Trimmed Weight Lbs" },
          pre_trim_weight_grams: {
            $ref: "wheel_thrown.clay_weight_grams",
            label: "Pre-trim Weight Lbs",
          },
        },
      },
      {
        id: "submitted_to_bisque_fire",
        visible: true,
        friendly_name: "Queued → Bisque",
        description: "Queued for bisque.",
        successors: ["bisque_fired", "recycled"],
        fields: {
          kiln_location: {
            $ref: "@location.name",
            can_create: true,
          },
        },
      },
      {
        id: "bisque_fired",
        visible: true,
        friendly_name: "Planning → Glaze",
        description: "Bisque fired.",
        successors: ["glazed", "recycled"],
        fields: {
          kiln_temperature_c: { type: "integer" },
          cone: { type: "string", enum: ["04", "05"] },
        },
      },
      {
        id: "glazed",
        visible: true,
        friendly_name: "Glazing",
        description: "Glazing.",
        successors: ["glaze_fired", "recycled"],
        fields: {
          glaze_combination: {
            $ref: "@glaze_combination.name",
          },
        },
      },
      {
        id: "glaze_fired",
        visible: true,
        friendly_name: "Touching Up",
        description: "Glaze fired.",
        successors: ["completed", "recycled"],
      },
      {
        id: "completed",
        visible: true,
        friendly_name: "Completed",
        description: "Completed.",
        terminal: true,
      },
      {
        id: "recycled",
        visible: true,
        friendly_name: "Recycled",
        description: "Recycled.",
        terminal: true,
      },
    ],
  },
}));

vi.mock("../../../workflow.yml", () => ({
  default: mockWorkflow,
}));

// Mock the api module
vi.mock("../../util/api", () => ({
  fetchGlobalEntries: vi.fn().mockResolvedValue([]),
  fetchGlobalEntriesWithFilters: vi.fn().mockResolvedValue([]),
  updateCurrentState: vi.fn(),
  updatePiece: vi.fn(),
  createGlobalEntry: vi.fn(),
  toggleGlobalEntryFavorite: vi.fn().mockResolvedValue(undefined),
  fetchCloudinaryWidgetConfig: vi
    .fn()
    .mockResolvedValue({ cloud_name: "demo", api_key: "123456" }),
  signCloudinaryWidgetParams: vi.fn().mockResolvedValue("mock-signature"),
}));

// Render CloudinaryImage as a plain <img> so tests can assert on src/testid
vi.mock("../CloudinaryImage", () => ({
  default: ({
    url,
    "data-testid": testId,
    style,
    onLoad,
  }: {
    url: string;
    "data-testid"?: string;
    style?: React.CSSProperties;
    onLoad?: React.ReactEventHandler<HTMLImageElement>;
  }) => <img src={url} data-testid={testId} style={style} onLoad={onLoad} />,
}));

function makeState(overrides: Partial<PieceState> = {}): PieceState {
  return {
    state: "designed",
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    additional_fields: {},
    ...overrides,
  };
}

function makePieceDetail(overrides: Partial<PieceDetail> = {}): PieceDetail {
  const state = makeState();
  return {
    id: "test-piece-id",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    current_state: state,
    current_location: "",
    tags: [],
    history: [state],
    ...overrides,
  };
}

const defaultProps = {
  pieceState: makeState(),
  pieceId: "test-piece-id",
  onSaved: vi.fn(),
  onDirtyChange: vi.fn(),
  autosaveDelayMs: 0,
};

const noop = () => {};

function setScreenWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

// Helper to simulate a successful Cloudinary Upload Widget upload.
// The widget fires display-changed (shown) then success when open() is called.
function setupUploadWidget(
  overrides: { secure_url?: string; public_id?: string } = {},
) {
  const secure_url =
    overrides.secure_url ??
    "https://res.cloudinary.com/demo/image/upload/sample.jpg";
  const public_id = overrides.public_id ?? "sample";
  window.cloudinary = {
    createUploadWidget: vi.fn((_options, callback) => ({
      open: vi.fn(() => {
        callback(null, { event: "display-changed", info: { state: "shown" } });
        callback(null, {
          event: "success",
          info: { secure_url, public_id, resource_type: "image" },
        });
      }),
      close: noop,
      destroy: noop,
    })),
    openUploadWidget: vi.fn(),
  };
}

// Helper that sets up a controllable widget — events are fired manually via the
// returned triggerEvent function, allowing assertions mid-flight.
function setupControllableWidget() {
  let savedCallback: (error: unknown, result: unknown) => void = noop;
  window.cloudinary = {
    createUploadWidget: vi.fn((_options, callback) => {
      savedCallback = callback;
      return { open: vi.fn(), close: noop, destroy: noop };
    }),
    openUploadWidget: vi.fn(),
  };
  return {
    triggerEvent: (event: string, info: unknown) =>
      savedCallback(null, { event, info }),
    triggerError: (err: Error) =>
      savedCallback(err, {
        event: "error",
        info: { secure_url: "", public_id: "", resource_type: "image" },
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setScreenWidth(1024);
  vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("max-width:599.95px")
      ? window.innerWidth <= 599
      : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  // Reset window.cloudinary between tests
  window.cloudinary = undefined;
});

describe("WorkflowState", () => {
  it("renders without crashing", async () => {
    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(<WorkflowState {...defaultProps} />));
    });
    expect(container!).toBeInTheDocument();
  });

  it("renders a Notes field", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("renders state-specific fields when the state defines additional_fields", async () => {
    const bisqueState = makeState({
      state: "bisque_fired",
      additional_fields: { kiln_temperature_c: "1200", cone: "04" },
    });
    await act(async () => {
      render(<WorkflowState {...defaultProps} pieceState={bisqueState} />);
    });
    const tempInput = screen.getByLabelText("Kiln Temperature C");
    expect(tempInput).toBeInTheDocument();
    expect(tempInput).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Cone")).toBeInTheDocument();
  });

  it("renders state-reference additional fields with their values", async () => {
    const trimmedState = makeState({
      state: "trimmed",
      additional_fields: {
        trimmed_weight_grams: 900,
        pre_trim_weight_grams: 1200,
      },
    });
    await act(async () => {
      render(<WorkflowState {...defaultProps} pieceState={trimmedState} />);
    });
    expect(screen.getByLabelText("Trimmed Weight Lbs")).toHaveValue(900);
    expect(screen.getByLabelText("Pre-trim Weight Lbs")).toHaveValue(1200);
  });

  it("renders state ref fields as disabled (read-only)", async () => {
    const trimmedState = makeState({
      state: "trimmed",
      additional_fields: { pre_trim_weight_grams: 1200 },
    });
    await act(async () => {
      render(<WorkflowState {...defaultProps} pieceState={trimmedState} />);
    });
    expect(screen.getByLabelText("Pre-trim Weight Lbs")).toBeDisabled();
  });

  it("renders inline additional fields as editable", async () => {
    const trimmedState = makeState({
      state: "trimmed",
      additional_fields: { trimmed_weight_grams: 900 },
    });
    await act(async () => {
      render(<WorkflowState {...defaultProps} pieceState={trimmedState} />);
    });
    expect(screen.getByLabelText("Trimmed Weight Lbs")).not.toBeDisabled();
  });

  it("lets you choose an existing global reference option", async () => {
    vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
      { id: "loc1", name: "Kiln A", isPublic: false },
    ]);
    const globalState = makeState({
      state: "submitted_to_bisque_fire",
      additional_fields: { kiln_location: "" },
    });
    render(<WorkflowState {...defaultProps} pieceState={globalState} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Kiln Location" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Kiln A")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Kiln A"));
    expect(screen.getByText("Kiln A")).toBeInTheDocument();
  });

  it("allows creating a new global reference option", async () => {
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
    let resolveCreate!: (value: api.GlobalEntry) => void;
    const createPromise = new Promise<api.GlobalEntry>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(api.createGlobalEntry).mockReturnValue(createPromise);
    const globalState = makeState({
      state: "submitted_to_bisque_fire",
      additional_fields: { kiln_location: "" },
    });
    render(<WorkflowState {...defaultProps} pieceState={globalState} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Kiln Location" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Create" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Location" }),
      "New Kiln",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Location" }));
    await waitFor(() =>
      expect(api.createGlobalEntry).toHaveBeenCalledWith(
        "location",
        { field: "name", value: "New Kiln" },
      ),
    );
    await act(async () =>
      resolveCreate({ id: "new-id", name: "New Kiln", isPublic: false }),
    );
    await waitFor(() => expect(screen.getByText("New Kiln")).toBeInTheDocument());
  });

  it("fetches global entries for createable global refs", async () => {
    const withGlobalRef = makeState({
      state: "submitted_to_bisque_fire",
      additional_fields: { kiln_location: "" },
    });
    render(<WorkflowState {...defaultProps} pieceState={withGlobalRef} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Kiln Location" }),
    );
    await waitFor(() =>
      expect(api.fetchGlobalEntriesWithFilters).toHaveBeenCalledWith(
        "location",
        {},
      ),
    );
  });

  it("keeps the floating autosave status hidden before any changes", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    expect(screen.queryByTestId("autosave-status")).not.toBeInTheDocument();
  });

  it("does not save when there are no changes", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    expect(api.updateCurrentState).not.toHaveBeenCalled();
  });

  it("shows notes from pieceState", async () => {
    await act(async () => {
      render(
        <WorkflowState
          {...defaultProps}
          pieceState={makeState({ notes: "Some notes" })}
        />,
      );
    });
    expect(screen.getByLabelText("Notes")).toHaveValue("Some notes");
  });

  it("shows pending autosave after editing notes", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "New notes" },
    });
    expect(screen.getByTestId("autosave-status")).toHaveTextContent(
      "Saving soon",
    );
  });

  it("shows autosave activity after editing", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Changed" },
    });
    expect(screen.getByTestId("autosave-status")).toHaveTextContent(
      "Saving soon",
    );
  });

  it("keeps the saved pill hidden when nothing has changed", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    expect(screen.queryByTestId("autosave-status")).not.toBeInTheDocument();
  });

  it("calls onSaved after successful save", async () => {
    const updated = makePieceDetail();
    vi.mocked(api.updateCurrentState).mockResolvedValue(updated);
    const onSaved = vi.fn();
    render(<WorkflowState {...defaultProps} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "New notes" },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
  });

  it("shows error message on save failure", async () => {
    vi.mocked(api.updateCurrentState).mockRejectedValue(
      new Error("Network error"),
    );
    render(<WorkflowState {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "New notes" },
    });
    await waitFor(() =>
      expect(
        screen.getByText("Autosave failed. Your changes are still here."),
      ).toBeInTheDocument(),
    );
  });

  it("remains dirty when current state API fails during save", async () => {
    vi.mocked(api.updateCurrentState).mockRejectedValue(
      new Error("Network error"),
    );
    render(<WorkflowState {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Dirty notes" },
    });
    await waitFor(() =>
      expect(
        screen.getByText("Autosave failed. Your changes are still here."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("autosave-status")).toHaveTextContent(
      "Autosave failed",
    );
  });

  it("calls onDirtyChange with true when dirty", async () => {
    const onDirtyChange = vi.fn();
    await act(async () => {
      render(<WorkflowState {...defaultProps} onDirtyChange={onDirtyChange} />);
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Changed" },
    });
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("calls onDirtyChange with false when reverted", async () => {
    const onDirtyChange = vi.fn();
    await act(async () => {
      render(
        <WorkflowState
          {...defaultProps}
          pieceState={makeState({ notes: "original" })}
          onDirtyChange={onDirtyChange}
        />,
      );
    });
    // Change and revert
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "changed" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "original" },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("upload button is always visible", async () => {
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    expect(
      screen.getByRole("button", { name: "Upload Image" }),
    ).toBeInTheDocument();
  });

  it("shows a floating camera action on mobile layouts", async () => {
    setScreenWidth(390);
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    const uploadAction = screen.getByRole("button", { name: "Upload Image" });
    expect(uploadAction).toBeInTheDocument();
    expect(uploadAction).toHaveClass("MuiFab-root");
  });

  it("successful widget upload immediately saves the image to state", async () => {
    const updated = makePieceDetail();
    vi.mocked(api.updateCurrentState).mockResolvedValue(updated);
    setupUploadWidget({
      secure_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      public_id: "sample",
    });
    render(<WorkflowState {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    await waitFor(() =>
      expect(api.updateCurrentState).toHaveBeenCalledWith(
        "test-piece-id",
        expect.objectContaining({
          images: expect.arrayContaining([
            expect.objectContaining({
              url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
              cloudinary_public_id: "sample",
            }),
          ]),
        }),
      ),
    );
  });

  it("widget upload error shows error message", async () => {
    const { triggerError } = setupControllableWidget();
    render(<WorkflowState {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    // Wait for createUploadWidget to have been called (config fetch has resolved)
    await waitFor(() =>
      expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled(),
    );
    await act(async () => triggerError(new Error("Upload failed")));
    await waitFor(() =>
      expect(
        screen.getByText("Upload failed. Please try again."),
      ).toBeInTheDocument(),
    );
  });

  it("upload button shows spinner and is disabled while widget is loading", async () => {
    setupControllableWidget();
    await act(async () => {
      render(<WorkflowState {...defaultProps} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    // widgetLoading is set synchronously on click, before the async config fetch
    expect(screen.getByRole("button", { name: "Upload Image" })).toBeDisabled();
    expect(
      screen.getByRole("progressbar", { hidden: true }),
    ).toBeInTheDocument();
  });

  it("upload button re-enables after display-changed shown", async () => {
    const { triggerEvent } = setupControllableWidget();
    render(<WorkflowState {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    await waitFor(() =>
      expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled(),
    );
    await act(async () => triggerEvent("display-changed", { state: "shown" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload Image" }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.queryByRole("progressbar", { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("upload button re-enables after widget error", async () => {
    const { triggerError } = setupControllableWidget();
    render(<WorkflowState {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    await waitFor(() =>
      expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled(),
    );
    await act(async () => triggerError(new Error("Upload failed")));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload Image" }),
      ).not.toBeDisabled(),
    );
    expect(
      screen.queryByRole("progressbar", { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("widget config fetch failure shows error message", async () => {
    vi.mocked(api.fetchCloudinaryWidgetConfig).mockRejectedValue(
      new Error("Network error"),
    );
    render(<WorkflowState {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload Image" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Failed to load upload configuration. Please try again.",
        ),
      ).toBeInTheDocument(),
    );
  });
  it("does not render uploaded image entries in the workflow section", async () => {
    await act(async () => {
      render(
        <WorkflowState
          {...defaultProps}
          pieceState={makeState({
            images: [
              {
                url: "http://example.com/img.jpg",
                caption: "Keep",
                created: new Date(),
              },
            ],
          })}
        />,
      );
    });
    expect(screen.queryByText("Photo 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Keep")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders enum and number additional fields for bisque_fired state", async () => {
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
    await act(async () => {
      render(<WorkflowState {...defaultProps} pieceState={makeState({ state: "bisque_fired", additional_fields: {} })} />);
    });
    // cone is an enum field — verify select renders
    const coneField = screen.getByLabelText("Cone");
    expect(coneField).toBeInTheDocument();
  });

  it("handleFieldChange: edits to additional fields make the form dirty", async () => {
    const onDirtyChange = vi.fn();
    await act(async () => {
      render(
        <WorkflowState
          {...defaultProps}
          onDirtyChange={onDirtyChange}
          pieceState={makeState({
            state: "trimmed",
            additional_fields: { trimmed_weight_grams: 900 },
          })}
        />,
      );
    });
    fireEvent.change(screen.getByLabelText("Trimmed Weight Lbs"), {
      target: { value: "950" },
    });
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("accepts any valid workflow state", async () => {
    const states: PieceState["state"][] = [
      "designed",
      "glazed",
      "completed",
      "recycled",
    ];
    for (const state of states) {
      await act(async () => {
        expect(() =>
          render(
            <WorkflowState
              {...defaultProps}
              pieceState={makeState({ state })}
            />,
          ),
        ).not.toThrow();
      });
    }
  });

  describe("thumbnail-backed global ref picker (glazed → glaze_combination)", () => {
    it("renders a Browse button instead of a text input for thumbnail-backed globals", async () => {
      const glazedState = makeState({ state: "glazed", additional_fields: {} });
      await act(async () => {
        render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      });
      expect(
        screen.getByRole("button", { name: "Browse Glaze Combination" }),
      ).toBeInTheDocument();
      // No text input with the field label — free typing is not supported
      expect(
        screen.queryByLabelText("Glaze Combination"),
      ).not.toBeInTheDocument();
    });

    it("shows the selected value as a chip when a glaze combination is set", async () => {
      const glazedState = makeState({
        state: "glazed",
        additional_fields: {
          glaze_combination: { id: "gc1", name: "Iron Red!Clear" },
        },
      });
      await act(async () => {
        render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      });
      expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Change Glaze Combination" }),
      ).toBeInTheDocument();
    });

    it("shows the chip as deletable when a value is set", async () => {
      const glazedState = makeState({
        state: "glazed",
        additional_fields: {
          glaze_combination: { id: "gc1", name: "Iron Red!Clear" },
        },
      });
      await act(async () => {
        render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      });
      const chip = screen.getByRole("button", { name: /iron red!clear/i });
      // MUI adds MuiChip-deletable when onDelete is wired up
      expect(chip).toHaveClass("MuiChip-deletable");
    });

    it("clears the selected value when the chip cancel icon is clicked", async () => {
      vi.mocked(api.updateCurrentState).mockResolvedValue(
        makePieceDetail({
          current_state: makeState({
            state: "glazed",
            additional_fields: {},
          }),
        }),
      );
      const glazedState = makeState({
        state: "glazed",
        additional_fields: {
          glaze_combination: { id: "gc1", name: "Iron Red!Clear" },
        },
      });
      await act(async () => {
        render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      });
      const chip = screen.getByRole("button", { name: /iron red!clear/i });
      // The MUI Chip cancel SVG icon is the last child element of the chip
      const cancelIcon = chip.lastElementChild;
      await act(async () => {
        if (cancelIcon) fireEvent.click(cancelIcon);
      });
      await waitFor(() =>
        expect(screen.queryByText("Iron Red!Clear")).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: "Browse Glaze Combination" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(api.updateCurrentState).toHaveBeenCalledWith(
          "test-piece-id",
          expect.objectContaining({
            additional_fields: expect.objectContaining({
              glaze_combination: null,
            }),
          }),
        ),
      );
    });

    it("opens the browse dialog when Browse button is clicked", async () => {
      const glazedState = makeState({ state: "glazed", additional_fields: {} });
      render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Browse Glaze Combination" }),
      );
      await waitFor(() =>
        expect(
          screen.getByText("Browse Glaze Combinations"),
        ).toBeInTheDocument(),
      );
    });

    it("keeps glaze combination browse-only when can_create is not set", async () => {
      const glazedState = makeState({ state: "glazed", additional_fields: {} });
      render(<WorkflowState {...defaultProps} pieceState={glazedState} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Browse Glaze Combination" }),
      );
      expect(
        screen.queryByRole("tab", { name: "Create" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create Glaze Combination" }),
      ).not.toBeInTheDocument();
    });
  });
});
