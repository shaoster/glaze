import type { CSSProperties, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PiecePhotoGallery, { type PiecePhotoGalleryImage } from "../PiecePhotoGallery";

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
    const onSaveCaption = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onSaveCaption={onSaveCaption}
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

    expect(onSaveCaption).toHaveBeenCalledWith(0, "Updated caption");
  });

  it("lets current-state gallery images be deleted through the confirmation dialog", async () => {
    const onDeleteImage = vi.fn().mockResolvedValue(undefined);

    render(
      <PiecePhotoGallery
        images={makeImages()}
        onSetAsThumbnail={vi.fn().mockResolvedValue(undefined)}
        onDeleteImage={onDeleteImage}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "2 photos" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete piece photo 1" }),
    );

    expect(screen.getByText("Remove Image")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onDeleteImage).toHaveBeenCalledWith(0);
  });
});
