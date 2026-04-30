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

describe("PiecePhotoGalleryGrid", () => {
  it("shows an empty state when there are no images", () => {
    render(
      <PiecePhotoGalleryGrid
        images={[]}
        requestedWidth={320}
        requestedHeight={240}
        canDeleteImages={false}
        onOpenImage={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("No images for this piece yet.")).toBeInTheDocument();
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
        requestedHeight={240}
        canDeleteImages
        onOpenImage={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute("alt", "Piece photo");
  });
});
