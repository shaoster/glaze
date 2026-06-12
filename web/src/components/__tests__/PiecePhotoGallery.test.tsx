import type { ComponentProps, CSSProperties, ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { PieceDetail } from "../../util/types";
import PiecePhotoGallery, {
  type EditablePiecePhoto,
  type PiecePhotoGalleryImage,
} from "../PiecePhotoGallery";

vi.mock("../../util/api", () => ({
  moveImage: vi.fn(),
  updateCurrentState: vi.fn(),
  updateImageCrop: vi.fn(),
  updatePastState: vi.fn(),
  updatePiece: vi.fn(),
}));

vi.mock("../../util/normalizeWorkflowFields", () => ({
  normalizeFields: (value: unknown) => value,
}));

function renderGallery(
  element: React.ReactElement<ComponentProps<typeof PiecePhotoGallery>>,
) {
  return render(
    <MemoryRouter initialEntries={["/pieces/piece-1"]}>{element}</MemoryRouter>,
  );
}

vi.mock("../AppImage", () => ({
  default: ({
    alt,
    url,
    style,
  }: {
    alt?: string;
    url: string;
    style?: CSSProperties;
  }) => <img alt={alt} src={url} style={style} />,
}));

vi.mock("masonic", () => ({
  Masonry: ({
    items,
    render: RenderComponent,
  }: {
    items: any[];
    render: React.ComponentType<{ data: any; index: number; width: number }>;
  }) => (
    <div data-testid="masonry-grid">
      {items.map((item, index) => (
        <div key={index}>
          <RenderComponent data={item} index={index} width={300} />
        </div>
      ))}
    </div>
  ),
}));

vi.mock("../ImageLightbox", () => ({
  default: ({
    images,
    initialIndex,
    footerActions,
    onClose,
    onSetAsThumbnail,
  }: {
    images: PiecePhotoGalleryImage[];
    initialIndex: number;
    footerActions?: (opts: { index: number; settingThumbnail: boolean; isCurrentThumbnail: boolean }) => ReactNode;
    onClose: () => void;
    onSetAsThumbnail?: (image: PiecePhotoGalleryImage) => Promise<void>;
  }) => (
    <div aria-label="Mock lightbox" role="dialog">
      <div>{images[initialIndex].caption}</div>
      {footerActions?.({ index: initialIndex, settingThumbnail: false, isCurrentThumbnail: false })}
      {onSetAsThumbnail && (
        <button onClick={() => void onSetAsThumbnail(images[initialIndex])}>
          Set as thumbnail
        </button>
      )}
      <button onClick={onClose}>Close lightbox</button>
    </div>
  ),
}));

function makeImages(): PiecePhotoGalleryImage[] {
  return [
    {
      url: "https://example.com/a.jpg",
      caption: "Freshly thrown",
      created: new Date("2024-01-16T10:00:00Z"),
      image_id: "image-a",
      stateLabel: "Throwing",
      stateId: "state-current",
      editableCurrentStateIndex: 0,
    },
    {
      url: "https://example.com/b.jpg",
      caption: "Trimmed rim",
      created: new Date("2024-01-17T10:00:00Z"),
      image_id: "image-b",
      stateLabel: "Trimming",
      stateId: "state-past",
      editableCurrentStateIndex: null,
    },
  ];
}

function makeSingleImage(
  overrides: Partial<PiecePhotoGalleryImage> = {},
): PiecePhotoGalleryImage[] {
  return [
    {
      url: "https://example.com/solo.jpg",
      caption: "Only photo",
      created: new Date("2024-01-18T10:00:00Z"),
      image_id: "image-solo",
      stateLabel: "Throwing",
      stateId: "state-current",
      editableCurrentStateIndex: 0,
      ...overrides,
    },
  ];
}

const DEFAULT_PIECE_STATES = [
  { id: "state-current", label: "Wheel Thrown" },
  { id: "state-past", label: "Designed" },
];

async function openMoveMenu() {
  // hidden: true because MUI Dialog aria-hides the inline mock lightbox
  await userEvent.click(screen.getByRole("button", { name: /Move to/i, hidden: true }));
}

function makeUpdatedPiece(overrides: Partial<PieceDetail> = {}): PieceDetail {
  const state = {
    id: "state-id-1",
    state: "wheel_thrown" as const,
    notes: "Current notes",
    created: new Date("2024-01-16T10:00:00Z"),
    last_modified: new Date("2024-01-16T10:00:00Z"),
    images: [],
    previous_state: "designed" as const,
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
  };
  return {
    id: "piece-1",
    name: "Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-16T10:00:00Z"),
    thumbnail: null,
    shared: false,
    is_editable: false,
    can_edit: true,
    current_state: state,
    current_location: "",
    tags: [],
    showcase_story: "",
    showcase_fields: [],
    history: [state],
    ...overrides,
  };
}

describe("PiecePhotoGallery", () => {
  it("opens a headerless gallery dialog from the photo count chip", async () => {
    renderGallery(<PiecePhotoGallery images={makeImages()} />);

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));

    expect(screen.getByLabelText("Piece photos")).toBeInTheDocument();
    expect(screen.queryByText("Piece photos")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /open piece photo/i }),
    ).toHaveLength(2);
  });

  it("shows the friendly state label in the lightbox footer", async () => {
    renderGallery(<PiecePhotoGallery images={makeImages()} />);

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 2" }),
    );

    expect(screen.getByText("Added in Trimming")).toBeInTheDocument();
  });

  it("saves edited captions from the lightbox for current-state images", async () => {
    const updatedPiece = makeUpdatedPiece();
    const updateCurrentStateFn = vi.fn().mockResolvedValue(updatedPiece);
    const onPieceUpdated = vi.fn();

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={onPieceUpdated}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(screen.getByLabelText("Edit caption"));
    const captionInput = screen.getByLabelText("Edit photo caption", {
      selector: "input",
    });
    fireEvent.change(captionInput, { target: { value: "Updated caption" } });
    await userEvent.click(screen.getByText("Save"));

    expect(updateCurrentStateFn).toHaveBeenCalledWith(
      "piece-1",
      expect.objectContaining({
        notes: "Current notes",
        images: [
          {
            url: "https://example.com/a.jpg",
            caption: "Updated caption",
            crop: null,
            width: null,
            height: null,
          },
        ] satisfies EditablePiecePhoto[],
      }),
    );
    expect(onPieceUpdated).toHaveBeenCalledWith(updatedPiece);
  });

  it("lets current-state gallery images be deleted through the confirmation dialog", async () => {
    const updateCurrentStateFn = vi.fn().mockResolvedValue(makeUpdatedPiece());

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );

    expect(screen.getByText("Remove Image")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(updateCurrentStateFn).toHaveBeenCalledWith(
      "piece-1",
      expect.objectContaining({ images: [] }),
    );
  });

  it("lets you click the caption text itself to start editing and save with Enter", async () => {
    const updateCurrentStateFn = vi.fn().mockResolvedValue(makeUpdatedPiece());

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    const lightbox = screen.getByLabelText("Mock lightbox");
    await userEvent.click(within(lightbox).getAllByText("Freshly thrown")[1]);
    const captionInput = within(lightbox).getByLabelText("Edit photo caption", {
      selector: "input",
    });
    await act(async () => {
      fireEvent.change(captionInput, { target: { value: "Wheel detail" } });
      fireEvent.keyDown(captionInput, { key: "Enter" });
    });

    expect(updateCurrentStateFn).toHaveBeenCalledWith(
      "piece-1",
      expect.objectContaining({
        images: [
          {
            url: "https://example.com/a.jpg",
            caption: "Wheel detail",
            crop: null,
            width: null,
            height: null,
          },
        ] satisfies EditablePiecePhoto[],
      }),
    );
  });

  it("cancels caption edits with Escape", async () => {
    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={vi.fn().mockResolvedValue(makeUpdatedPiece())}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(screen.getByLabelText("Edit caption"));
    const captionInput = within(
      screen.getByLabelText("Mock lightbox"),
    ).getByLabelText("Edit photo caption", {
      selector: "input",
    });
    await act(async () => {
      fireEvent.change(captionInput, { target: { value: "Discard me" } });
      fireEvent.keyDown(captionInput, { key: "Escape" });
    });

    expect(
      within(screen.getByLabelText("Mock lightbox")).queryByLabelText(
        "Edit photo caption",
        { selector: "input" },
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Mock lightbox")).getAllByText(
        "Freshly thrown",
      )[1],
    ).toBeInTheDocument();
  });

  it("exits caption saves early when current-state image persistence is not fully wired", async () => {
    const updateCurrentStateFn = vi.fn();
    const onPieceUpdated = vi.fn();

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId=""
        currentStateNotes="Current notes"
        onPieceUpdated={onPieceUpdated}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(screen.getByLabelText("Edit caption"));
    const captionInput = within(
      screen.getByLabelText("Mock lightbox"),
    ).getByLabelText("Edit photo caption", { selector: "input" });
    fireEvent.change(captionInput, { target: { value: "No-op caption" } });
    await userEvent.click(screen.getByText("Save"));

    expect(updateCurrentStateFn).not.toHaveBeenCalled();
    expect(onPieceUpdated).not.toHaveBeenCalled();
    expect(
      within(screen.getByLabelText("Mock lightbox")).queryByLabelText(
        "Edit photo caption",
        { selector: "input" },
      ),
    ).not.toBeInTheDocument();
  });

  it("closes the gallery dialog from the Close button", async () => {
    renderGallery(<PiecePhotoGallery images={makeImages()} />);

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Piece photos")).not.toBeInTheDocument(),
    );
  });

  it("closes the lightbox from the close button", async () => {
    renderGallery(<PiecePhotoGallery images={makeImages()} />);

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    const lightbox = screen.getByLabelText("Mock lightbox");
    await userEvent.click(within(lightbox).getByText("Close lightbox"));

    await waitFor(() =>
      expect(screen.queryByLabelText("Mock lightbox")).not.toBeInTheDocument(),
    );
  });

  it("cancels image deletion without saving", async () => {
    const updateCurrentStateFn = vi.fn().mockResolvedValue(makeUpdatedPiece());

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Remove Image")).not.toBeInTheDocument(),
    );
    expect(updateCurrentStateFn).not.toHaveBeenCalled();
  });

  it("exits thumbnail updates early when the piece id is falsy", async () => {
    const updatePieceFn = vi.fn();
    const onPieceUpdated = vi.fn();

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId=""
        onPieceUpdated={onPieceUpdated}
        updatePieceFn={updatePieceFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(
      within(screen.getByLabelText("Mock lightbox")).getByText(
        "Set as thumbnail",
      ),
    );

    expect(updatePieceFn).not.toHaveBeenCalled();
    expect(onPieceUpdated).not.toHaveBeenCalled();
  });

  it("persists thumbnail updates from the lightbox", async () => {
    const updatedPiece = makeUpdatedPiece({
      thumbnail: {
        url: "https://example.com/a.jpg",
      },
    });
    const updatePieceFn = vi.fn().mockResolvedValue(updatedPiece);
    const onPieceUpdated = vi.fn();

    renderGallery(
      <PiecePhotoGallery
        images={makeImages()}
        pieceId="piece-1"
        onPieceUpdated={onPieceUpdated}
        updatePieceFn={updatePieceFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(
      within(screen.getByLabelText("Mock lightbox")).getByText(
        "Set as thumbnail",
      ),
    );

    await waitFor(() =>
      expect(updatePieceFn).toHaveBeenCalledWith("piece-1", {
        thumbnail: {
          url: "https://example.com/a.jpg",
          crop: null,
          cropped_url: null,
          crop_task_failed: false,
          r2_key: null,
          image_id: "image-a",
          width: null,
          height: null,
        },
      }),
    );
    expect(onPieceUpdated).toHaveBeenCalledWith(updatedPiece);
  });

  it("starts editing an empty caption with a blank input", async () => {
    renderGallery(
      <PiecePhotoGallery
        images={makeSingleImage({ caption: "" })}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={vi.fn().mockResolvedValue(makeUpdatedPiece())}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "1 photo" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(
      within(screen.getByLabelText("Mock lightbox")).getByRole("button", { name: /Caption/i, hidden: true }),
    );

    expect(
      within(screen.getByLabelText("Mock lightbox")).getByLabelText(
        "Edit photo caption",
        { selector: "input" },
      ),
    ).toHaveValue("");
  });

  it("closes the lightbox after deleting the last image currently open", async () => {
    const updateCurrentStateFn = vi.fn().mockResolvedValue(makeUpdatedPiece());

    renderGallery(
      <PiecePhotoGallery
        images={makeSingleImage()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "1 photo" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open piece photo 1" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(updateCurrentStateFn).toHaveBeenCalledWith(
      "piece-1",
      expect.objectContaining({ images: [] }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Mock lightbox")).not.toBeInTheDocument(),
    );
  });

  describe("move image to state", () => {
    it("does not show the move control when pieceStates is not provided", async () => {
      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          moveImageFn={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );

      expect(
        screen.queryByRole("button", { name: /Move to/i }),
      ).not.toBeInTheDocument();
    });

    it("does not show the move control when moveImageFn is not provided", async () => {
      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );

      expect(
        screen.queryByRole("button", { name: /Move to/i }),
      ).not.toBeInTheDocument();
    });

    it("shows an enabled move select when the move endpoint is wired", async () => {
      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );
      const moveButton = screen.getByRole("button", { name: /Move to/i, hidden: true });

      expect(moveButton).not.toBeDisabled();
    });

    it("opens state picker showing only other states", async () => {
      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );
      await openMoveMenu();

      expect(screen.getByText("Designed")).toBeInTheDocument();
      expect(screen.queryByText("Wheel Thrown")).not.toBeInTheDocument();
    });

    it("opens state picker showing current state when a past-state image is open", async () => {
      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 2" }),
      );
      await openMoveMenu();

      expect(screen.getByText("Wheel Thrown")).toBeInTheDocument();
      expect(screen.queryByText("Designed")).not.toBeInTheDocument();
    });

    it("moves a current-state image to a past state via the move endpoint", async () => {
      const finalPiece = makeUpdatedPiece();
      const moveImageFn = vi.fn().mockResolvedValue(finalPiece);
      const onPieceUpdated = vi.fn();

      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          currentStateCustomFields={{}}
          onPieceUpdated={onPieceUpdated}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={moveImageFn}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );
      await openMoveMenu();
      await userEvent.click(screen.getByText("Designed"));

      await waitFor(() =>
        expect(moveImageFn).toHaveBeenCalledWith(
          "image-a",
          "state-current",
          "state-past",
        ),
      );
      await waitFor(() =>
        expect(onPieceUpdated).toHaveBeenCalledWith(finalPiece),
      );
    });

    it("moves a past-state image to the current state via the move endpoint", async () => {
      const finalPiece = makeUpdatedPiece();
      const moveImageFn = vi.fn().mockResolvedValue(finalPiece);
      const onPieceUpdated = vi.fn();

      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          currentStateCustomFields={{}}
          onPieceUpdated={onPieceUpdated}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={moveImageFn}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 2" }),
      );
      await openMoveMenu();
      await userEvent.click(screen.getByText("Wheel Thrown"));

      await waitFor(() =>
        expect(moveImageFn).toHaveBeenCalledWith(
          "image-b",
          "state-past",
          "state-current",
        ),
      );
      await waitFor(() =>
        expect(onPieceUpdated).toHaveBeenCalledWith(finalPiece),
      );
    });

    it("shows error message when move API call fails", async () => {
      const moveImageFn = vi.fn().mockRejectedValue(new Error("Network error"));

      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={moveImageFn}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );
      await openMoveMenu();
      await userEvent.click(screen.getByText("Designed"));

      await waitFor(() =>
        expect(
          screen.getByText("Failed to move photo. Please try again."),
        ).toBeInTheDocument(),
      );
    });

    it("closes the lightbox after a successful move", async () => {
      const moveImageFn = vi.fn().mockResolvedValue(makeUpdatedPiece());

      renderGallery(
        <PiecePhotoGallery
          images={makeImages()}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={vi.fn()}
          pieceStates={DEFAULT_PIECE_STATES}
          moveImageFn={moveImageFn}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Open piece photo 1" }),
      );
      await openMoveMenu();
      await userEvent.click(screen.getByText("Designed"));

      await waitFor(() =>
        expect(
          screen.queryByLabelText("Mock lightbox"),
        ).not.toBeInTheDocument(),
      );
    });
  });

  it("exits image deletion early when the pending image is no longer editable", async () => {
    const updateCurrentStateFn = vi.fn();
    const { rerender } = renderGallery(
      <PiecePhotoGallery
        images={makeSingleImage()}
        pieceId="piece-1"
        currentStateNotes="Current notes"
        onPieceUpdated={vi.fn()}
        updateCurrentStateFn={updateCurrentStateFn}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "1 photo" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );

    rerender(
      <MemoryRouter initialEntries={["/pieces/piece-1"]}>
        <PiecePhotoGallery
          images={makeSingleImage({ editableCurrentStateIndex: null })}
          pieceId="piece-1"
          currentStateNotes="Current notes"
          onPieceUpdated={vi.fn()}
          updateCurrentStateFn={updateCurrentStateFn}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(updateCurrentStateFn).not.toHaveBeenCalled();
    expect(screen.getByText("Remove Image")).toBeInTheDocument();
  });
});
