import type { CSSProperties } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PiecePhotoGalleryGrid from "../PiecePhotoGalleryGrid";

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
          <RenderComponent data={item} index={index} width={320} />
        </div>
      ))}
    </div>
  ),
}));

describe("PiecePhotoGalleryGrid", () => {
  it("shows an empty state when there are no images", () => {
    render(
      <PiecePhotoGalleryGrid
        images={[]}
        requestedWidth={320}
        canDeleteImages={false}
        onOpenImage={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No images for this piece yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses a neutral fallback alt when a grid image has no caption", () => {
    render(
      <PiecePhotoGalleryGrid
        images={[
          {
            url: "https://example.com/untitled.jpg",
            caption: "",
            cloudinary_public_id: "piece/untitled",
            cloud_name: null,
            stateLabel: "Throwing",
            editableCurrentStateIndex: 0,
          },
        ]}
        requestedWidth={320}
        canDeleteImages
        onOpenImage={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute("alt", "Piece photo");
  });

  it("disables the delete button when the image is the current thumbnail", () => {
    const onRequestDelete = vi.fn();
    const thumbnailUrl = "https://example.com/thumbnail.jpg";

    render(
      <PiecePhotoGalleryGrid
        images={[
          {
            url: thumbnailUrl,
            caption: "Thumbnail Image",
            stateLabel: "Throwing",
            editableCurrentStateIndex: 0,
          },
          {
            url: "https://example.com/other.jpg",
            caption: "Other Image",
            stateLabel: "Throwing",
            editableCurrentStateIndex: 1,
          },
        ]}
        canDeleteImages
        currentThumbnailUrl={thumbnailUrl}
        onOpenImage={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    );

    const deleteButtons = screen.getAllByRole("button", {
      name: /delete piece photo/i,
    });
    expect(deleteButtons).toHaveLength(2);

    // First button (thumbnail) should be disabled
    expect(deleteButtons[0]).toBeDisabled();

    // Second button (other) should be enabled
    expect(deleteButtons[1]).not.toBeDisabled();
  });
});
