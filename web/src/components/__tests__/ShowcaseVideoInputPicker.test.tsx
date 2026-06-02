import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowcaseVideoInputPicker, {
  type ShowcaseVideoInputSelection,
} from "../ShowcaseVideoInputPicker";
import type { PieceDetail } from "../../util/types";

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
    ...overrides,
  };
}

describe("ShowcaseVideoInputPicker", () => {
  it("includes all notes and images by default", () => {
    render(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText("2 of 2 note entries will be used")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 frames will be used")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[3]).toBeChecked();
  });

  it("excludes notes and images when toggled", async () => {
    const onSelectionChange = vi.fn();
    render(
      <ShowcaseVideoInputPicker
        piece={makePiece()}
        selection={makeSelection()}
        onSelectionChange={onSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");

    await userEvent.click(checkboxes[0]);
    expect(onSelectionChange).toHaveBeenCalledWith({
      excludedImageKeys: [],
      excludedNoteKeys: ["state-id-throwing"],
    });

    await userEvent.click(checkboxes[2]);
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      excludedImageKeys: ["state-id-throwing:throwing-image"],
      excludedNoteKeys: [],
    });
  });

  it("reflects pre-existing exclusions", () => {
    render(
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
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it("locks the piece thumbnail as a required image input", async () => {
    const onSelectionChange = vi.fn();
    render(
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

    const thumbnailCheckbox = screen.getAllByRole("checkbox")[3];

    expect(thumbnailCheckbox).toBeChecked();
    expect(thumbnailCheckbox).toBeDisabled();
    expect(screen.getByText(/Locked as the video cover/)).toBeInTheDocument();

    fireEvent.click(thumbnailCheckbox);
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 2 frames will be used")).toBeInTheDocument();
  });
});
