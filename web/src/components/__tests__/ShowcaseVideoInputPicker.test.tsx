import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShowcaseVideoInputPicker, {
  type ShowcaseVideoInputSelection,
} from "../ShowcaseVideoInputPicker";
import type { PieceDetail } from "../../util/types";
import { DEFAULT_TRACK_ID, MUSIC_CATALOG } from "../../util/music";

vi.mock("../../util/workflow", () => ({
  formatState: (state: string) =>
    ({
      designed: "Designing",
      wheel_thrown: "Throwing",
      trimmed: "Trimming",
      completed: "Completed",
    })[state] ?? state,
}));

beforeEach(() => {
  window.localStorage.clear();
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makePiece(overrides: Partial<PieceDetail> = {}): PieceDetail {
  return {
    id: "piece-id-1",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    shared: false,
    is_editable: false,
    can_edit: true,
    current_state: {
      id: "state-id-current",
      state: "completed",
      notes: "Finished and ready.",
      created: new Date("2024-01-15T10:00:00Z"),
      last_modified: new Date("2024-01-15T10:00:00Z"),
      images: [
        {
          image_id: "current-image",
          url: "/img/current.jpg",
          caption: "Finished view",
          created: new Date("2024-01-15T10:00:00Z"),
          cloudinary_public_id: "current-image",
          cloud_name: "demo",
        },
      ],
      custom_fields: {},
      previous_state: null,
      next_state: null,
      has_been_edited: false,
    },
    current_location: "",
    tags: [],
    showcase_story: "",
    showcase_fields: [],
    history: [
      {
        id: "state-id-throwing",
        state: "wheel_thrown",
        notes: "Throwing at the wheel.",
        created: new Date("2024-01-14T10:00:00Z"),
        last_modified: new Date("2024-01-14T10:00:00Z"),
        images: [
          {
            image_id: "throwing-image",
            url: "/img/throwing.jpg",
            caption: "Wet clay",
            created: new Date("2024-01-14T10:00:00Z"),
            cloudinary_public_id: "throwing-image",
            cloud_name: "demo",
          },
        ],
        custom_fields: {},
        previous_state: null,
        next_state: null,
        has_been_edited: false,
      },
      {
        id: "state-id-trimmed",
        state: "trimmed",
        notes: "",
        created: new Date("2024-01-14T12:00:00Z"),
        last_modified: new Date("2024-01-14T12:00:00Z"),
        images: [],
        custom_fields: {},
        previous_state: null,
        next_state: null,
        has_been_edited: false,
      },
      {
        id: "state-id-current",
        state: "completed",
        notes: "Finished and ready.",
        created: new Date("2024-01-15T10:00:00Z"),
        last_modified: new Date("2024-01-15T10:00:00Z"),
        images: [
          {
            image_id: "current-image",
            url: "/img/current.jpg",
            caption: "Finished view",
            created: new Date("2024-01-15T10:00:00Z"),
            cloudinary_public_id: "current-image",
            cloud_name: "demo",
          },
        ],
        custom_fields: {},
        previous_state: null,
        next_state: null,
        has_been_edited: false,
      },
    ],
    ...overrides,
  };
}

function makeSelection(
  overrides: Partial<ShowcaseVideoInputSelection> = {},
): ShowcaseVideoInputSelection {
  return {
    excludedImageKeys: [],
    excludedNoteKeys: [],
    musicTrackId: DEFAULT_TRACK_ID,
    ...overrides,
  };
}

describe("ShowcaseVideoInputPicker", () => {
  it("includes all notes and images by default", () => {
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText("2 of 2 note entries will be used")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 frames will be used")).toBeInTheDocument();
    expect(screen.getByLabelText(/Include in the video: Throwing/)).toBeChecked();
    expect(screen.getByLabelText(/Include in the video: Completed/)).toBeChecked();
  });

  it("excludes notes and images when toggled", async () => {
    const onSelectionChange = vi.fn();
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={onSelectionChange}
      />,
    );

    await userEvent.click(
      screen.getByLabelText(/Include note in the video: Throwing/),
    );
    expect(onSelectionChange).toHaveBeenCalledWith({
      excludedImageKeys: [],
      excludedNoteKeys: ["state-id-throwing"],
      musicTrackId: DEFAULT_TRACK_ID,
    });

    await userEvent.click(screen.getByLabelText(/Include in the video: Throwing/));
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      excludedImageKeys: ["state-id-throwing:throwing-image"],
      excludedNoteKeys: [],
      musicTrackId: DEFAULT_TRACK_ID,
    });
  });

  it("reflects pre-existing exclusions", () => {
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection({
          excludedImageKeys: ["state-id-throwing:throwing-image"],
          excludedNoteKeys: ["state-id-throwing"],
        })}
        onSelectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText("1 of 2 note entries will be used")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 frames will be used")).toBeInTheDocument();
    expect(screen.getByLabelText(/Include in the video: Throwing/)).not.toBeChecked();
    expect(screen.getByLabelText(/Include in the video: Completed/)).toBeChecked();
  });

  it("locks the piece thumbnail as a required image input", async () => {
    const onSelectionChange = vi.fn();
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece({
          thumbnail: {
            url: "/img/current.jpg",
            cloudinary_public_id: "current-image",
            cloud_name: "demo",
          },
        })}
        selection={makeSelection({
          excludedImageKeys: ["state-id-current:current-image"],
        })}
        onSelectionChange={onSelectionChange}
      />,
    );

    const thumbnailCheckbox = screen.getByLabelText(/Locked cover: Completed/);

    expect(thumbnailCheckbox).toBeChecked();
    expect(thumbnailCheckbox).toBeDisabled();
    expect(screen.getByText("Cover")).toBeInTheDocument();

    fireEvent.click(thumbnailCheckbox);
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 2 frames will be used")).toBeInTheDocument();
  });

  it("lists catalog tracks and shows the selected track's attribution", () => {
    const defaultTrack = MUSIC_CATALOG.find((t) => t.id === DEFAULT_TRACK_ID)!;
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Background music track");
    expect(select).toHaveTextContent(
      `${defaultTrack.title} — ${defaultTrack.artist}`,
    );
    // Attribution is shown as structured labeled rows with links.
    expect(screen.getByText("Platform:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audio Library" })).toHaveAttribute(
      "href",
      defaultTrack.source_url,
    );
    expect(screen.getByRole("link", { name: defaultTrack.artist })).toHaveAttribute(
      "href",
      defaultTrack.artist_url,
    );
    expect(screen.getByRole("link", { name: defaultTrack.title })).toHaveAttribute(
      "href",
      defaultTrack.download_url || defaultTrack.source_url,
    );
  });

  it("emits the chosen music track id", async () => {
    const onSelectionChange = vi.fn();
    const other = MUSIC_CATALOG.find((t) => t.id !== DEFAULT_TRACK_ID)!;
    renderWithClient(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={onSelectionChange}
      />,
    );

    await userEvent.click(screen.getByLabelText("Background music track"));
    await userEvent.click(
      screen.getByRole("option", { name: `${other.title} — ${other.artist}` }),
    );

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      excludedImageKeys: [],
      excludedNoteKeys: [],
      musicTrackId: other.id,
    });
  });
});
