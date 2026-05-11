import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CloudinaryImage from "../CloudinaryImage";

const cloudinaryMocks = vi.hoisted(() => ({
  resize: vi.fn(),
  cropAddFlag: vi.fn(),
  fillGravity: vi.fn(), // retained to confirm gravity is never called
}));

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
        resize: cloudinaryMocks.resize.mockImplementation(function resize() {
          return this;
        }),
        delivery() {
          return this;
        },
      };
    }
  },
}));

vi.mock("@cloudinary/url-gen/actions/resize", () => ({
  scale: () => ({
    width() {
      return this;
    },
    height() {
      return this;
    },
  }),
  crop: () => ({
    width() {
      return this;
    },
    height() {
      return this;
    },
    x() {
      return this;
    },
    y() {
      return this;
    },
    addFlag: cloudinaryMocks.cropAddFlag.mockImplementation(function addFlag() {
      return this;
    }),
  }),
  fill: () => ({
    width() {
      return this;
    },
    height() {
      return this;
    },
    gravity: cloudinaryMocks.fillGravity.mockImplementation(function gravity() {
      return this;
    }),
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

vi.mock("@cloudinary/url-gen/qualifiers/flag", () => ({
  relative: () => "relative",
}));

describe("CloudinaryImage", () => {
  beforeEach(() => {
    cloudinaryMocks.resize.mockClear();
    cloudinaryMocks.cropAddFlag.mockClear();
    cloudinaryMocks.fillGravity.mockClear();
  });

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

  it("applies a relative crop before context sizing when crop is present", () => {
    render(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloud_name="demo"
        cloudinary_public_id="pottery/sample"
        crop={{ x: 0.1, y: 0.2, width: 0.6, height: 0.7 }}
        alt="Cloudinary pot"
        context="gallery"
      />,
    );

    expect(cloudinaryMocks.cropAddFlag).toHaveBeenCalledWith("relative");
    expect(cloudinaryMocks.resize).toHaveBeenCalledTimes(2);
  });

  it("never calls fill.gravity — always uses center fill to avoid face-detection zoom", () => {
    // With crop
    render(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloud_name="demo"
        cloudinary_public_id="pottery/sample"
        crop={{ x: 0.1, y: 0.2, width: 0.6, height: 0.7 }}
        alt="Cloudinary pot"
        context="thumbnail"
      />,
    );
    expect(cloudinaryMocks.fillGravity).not.toHaveBeenCalled();

    // Without crop
    render(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloud_name="demo"
        cloudinary_public_id="pottery/sample"
        alt="Cloudinary pot"
        context="thumbnail"
      />,
    );
    expect(cloudinaryMocks.fillGravity).not.toHaveBeenCalled();
  });

  it("resets loading state when only the crop changes", () => {
    const { rerender } = render(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloud_name="demo"
        cloudinary_public_id="pottery/sample"
        crop={{ x: 0.1, y: 0.2, width: 0.6, height: 0.7 }}
        alt="Cloudinary pot"
        context="gallery"
      />,
    );

    fireEvent.load(screen.getByAltText("Cloudinary pot"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(
      <CloudinaryImage
        url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
        cloud_name="demo"
        cloudinary_public_id="pottery/sample"
        crop={{ x: 0.2, y: 0.2, width: 0.6, height: 0.7 }}
        alt="Cloudinary pot"
        context="gallery"
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
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
