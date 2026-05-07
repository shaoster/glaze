import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import CloudinaryImage from "../CloudinaryImage";

vi.mock("@cloudinary/react", () => ({
  AdvancedImage: forwardRef(function MockAdvancedImage(
    {
      alt,
      className,
      "data-testid": testId,
      onError,
      onLoad,
      style,
    }: {
      alt?: string;
      className?: string;
      "data-testid"?: string;
      onError?: React.ReactEventHandler<HTMLImageElement>;
      onLoad?: React.ReactEventHandler<HTMLImageElement>;
      style?: React.CSSProperties;
    },
    ref: React.ForwardedRef<{
      imageRef: React.RefObject<HTMLImageElement | null>;
    }>,
  ) {
    const imageRef = useRef<HTMLImageElement>(null);
    useImperativeHandle(ref, () => ({ imageRef }), []);

    return (
      <img
        ref={imageRef}
        alt={alt}
        className={className}
        data-testid={testId}
        onError={onError}
        onLoad={onLoad}
        style={style}
      />
    );
  }),
}));

vi.mock("@cloudinary/url-gen", () => ({
  Cloudinary: class {
    image(publicId: string) {
      return {
        publicId,
        resize() {
          return this;
        },
        delivery() {
          return this;
        },
      };
    }
  },
}));

vi.mock("@cloudinary/url-gen/actions/resize", () => ({
  fill: () => ({
    width() {
      return this;
    },
    height() {
      return this;
    },
    gravity() {
      return this;
    },
  }),
  fit: () => ({
    width() {
      return this;
    },
    height() {
      return this;
    },
  }),
}));

vi.mock("@cloudinary/url-gen/actions/delivery", () => ({
  format: vi.fn(),
  quality: vi.fn(),
}));

vi.mock("@cloudinary/url-gen/qualifiers/format", () => ({
  auto: vi.fn(),
  jpg: vi.fn(),
}));

vi.mock("@cloudinary/url-gen/qualifiers/quality", () => ({
  auto: vi.fn(),
}));

vi.mock("@cloudinary/url-gen/qualifiers/gravity", () => ({
  autoGravity: vi.fn(),
}));

describe("CloudinaryImage", () => {
  it("shows a spinner until a fallback image loads", () => {
    render(
      <CloudinaryImage
        url="https://example.com/pot.jpg"
        alt="Pot"
        context="thumbnail"
      />,
    );

    const image = screen.getByAltText("Pot");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.load(image);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the spinner again when the image source changes", () => {
    const { rerender } = render(
      <CloudinaryImage
        url="https://example.com/first.jpg"
        alt="Pot"
        context="thumbnail"
      />,
    );

    const image = screen.getByAltText("Pot");
    fireEvent.load(image);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(
      <CloudinaryImage
        url="https://example.com/second.jpg"
        alt="Pot"
        context="thumbnail"
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows a spinner for Cloudinary-backed images until they load", () => {
    render(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloudinary_public_id="pottery/sample"
        alt="Cloudinary pot"
        context="preview"
      />,
    );

    const image = screen.getByAltText("Cloudinary pot");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.load(image);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders and clears loading state for lightbox-context images", () => {
    render(
      <CloudinaryImage
        url="https://example.com/lightbox.jpg"
        alt="Lightbox image"
        context="lightbox"
      />,
    );

    const image = screen.getByAltText("Lightbox image");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.load(image);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders and clears loading state for detail-context images", () => {
    render(
      <CloudinaryImage
        url="https://example.com/detail.jpg"
        alt="Detail image"
        context="detail"
      />,
    );

    const image = screen.getByAltText("Detail image");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.load(image);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("hides the spinner when the browser restores a cached image without a new load event", () => {
    render(
      <CloudinaryImage
        url="https://example.com/pot.jpg"
        alt="Pot"
        context="thumbnail"
      />,
    );

    const image = screen.getByAltText("Pot");
    Object.defineProperty(image, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      get: () => 64,
    });

    fireEvent(document, new Event("visibilitychange"));

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
