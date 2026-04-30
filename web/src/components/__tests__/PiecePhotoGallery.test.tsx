import type { CSSProperties, ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PiecePhotoGallery, {
  type EditablePiecePhoto,
  type PiecePhotoGalleryImage,
} from "../PiecePhotoGallery";

vi.mock("../CloudinaryImage", () => ({
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

vi.mock("../ImageLightbox", () => ({
  default: ({
    images,
    initialIndex,
    footerActions,
    onClose,
  }: {
    images: PiecePhotoGalleryImage[];
    initialIndex: number;
    footerActions?: (index: number) => ReactNode;
    onClose: () => void;
  }) => (
    <div aria-label="Mock lightbox" role="dialog">
      <div>{images[initialIndex].caption}</div>
      {footerActions?.(initialIndex)}
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
      cloudinary_public_id: "piece/a",
      stateLabel: "Throwing",
      editableCurrentStateIndex: 0,
    },
    {
      url: "https://example.com/b.jpg",
      caption: "Trimmed rim",
      created: new Date("2024-01-17T10:00:00Z"),
      cloudinary_public_id: "piece/b",
      stateLabel: "Trimming",
      editableCurrentStateIndex: null,
    },
  ];
}

describe("PiecePhotoGallery", () => {
  it("opens a headerless gallery dialog from the photo count chip", async () => {
    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));

    expect(screen.getByLabelText("Piece photos")).toBeInTheDocument();
    expect(screen.queryByText("Piece photos")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open piece photo/i })).toHaveLength(2);
  });

  it("shows the friendly state label in the lightbox footer", async () => {
    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Open piece photo 2" }));

    expect(screen.getByText("Added in Trimming")).toBeInTheDocument();
  });

  it("saves edited captions from the lightbox for current-state images", async () => {
    const onUpdateCurrentStateImages = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onUpdateCurrentStateImages={onUpdateCurrentStateImages}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Open piece photo 1" }));
    await userEvent.click(screen.getByLabelText("Edit caption"));
    const captionInput = screen.getByLabelText("Edit photo caption", {
      selector: "input",
    });
    fireEvent.change(captionInput, { target: { value: "Updated caption" } });
    await userEvent.click(screen.getByText("Save"));

    expect(onUpdateCurrentStateImages).toHaveBeenCalledWith([
      {
        url: "https://example.com/a.jpg",
        caption: "Updated caption",
        cloudinary_public_id: "piece/a",
      },
    ] satisfies EditablePiecePhoto[]);
  });

  it("lets current-state gallery images be deleted through the confirmation dialog", async () => {
    const onUpdateCurrentStateImages = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onUpdateCurrentStateImages={onUpdateCurrentStateImages}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );

    expect(screen.getByText("Remove Image")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onUpdateCurrentStateImages).toHaveBeenCalledWith([]);
  });

  it("lets you click the caption text itself to start editing and save with Enter", async () => {
    const onUpdateCurrentStateImages = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onUpdateCurrentStateImages={onUpdateCurrentStateImages}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Open piece photo 1" }));
    const lightbox = screen.getByLabelText("Mock lightbox");
    await userEvent.click(within(lightbox).getAllByText("Freshly thrown")[1]);
    const captionInput = within(lightbox).getByLabelText(
      "Edit photo caption",
      {
        selector: "input",
      },
    );
    await act(async () => {
      fireEvent.change(captionInput, { target: { value: "Wheel detail" } });
      fireEvent.keyDown(captionInput, { key: "Enter" });
    });

    expect(onUpdateCurrentStateImages).toHaveBeenCalledWith([
      {
        url: "https://example.com/a.jpg",
        caption: "Wheel detail",
        cloudinary_public_id: "piece/a",
      },
    ] satisfies EditablePiecePhoto[]);
  });

  it("cancels caption edits with Escape", async () => {
    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onUpdateCurrentStateImages={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Open piece photo 1" }));
    await userEvent.click(screen.getByLabelText("Edit caption"));
    const captionInput = within(screen.getByLabelText("Mock lightbox")).getByLabelText(
      "Edit photo caption",
      {
        selector: "input",
      },
    );
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
      within(screen.getByLabelText("Mock lightbox")).getAllByText("Freshly thrown")[1],
    ).toBeInTheDocument();
  });

  it("closes the gallery dialog from the Close button", async () => {
    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Piece photos")).not.toBeInTheDocument(),
    );
  });

  it("cancels image deletion without saving", async () => {
    const onUpdateCurrentStateImages = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onUpdateCurrentStateImages={onUpdateCurrentStateImages}
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
    expect(onUpdateCurrentStateImages).not.toHaveBeenCalled();
  });
});
