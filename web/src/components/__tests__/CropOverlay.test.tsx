import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Captures the props the component passes to the cropper so tests can assert on
// them (e.g. that no fixed aspect ratio is imposed — the #737 regression).
let lastCropperProps: any = null;

// Fake cropper "ref" handed to onChange. getCoordinates returns a deliberately
// NON-square region (width !== height) so a fixed aspect ratio would be detectable.
const fakeCropper = {
  getCoordinates: () => ({ left: 10, top: 20, width: 30, height: 40 }),
  getState: () => ({ imageSize: { width: 100, height: 100 } }),
};

vi.mock("react-advanced-cropper", () => ({
  Cropper: function MockCropper(props: any) {
    lastCropperProps = props;
    const propsRef = React.useRef(props);
    propsRef.current = props;
    React.useEffect(() => {
      propsRef.current.onReady?.(fakeCropper);
      propsRef.current.onChange?.(fakeCropper);
    }, []);
    return <div data-testid="mock-cropper" />;
  },
  RectangleStencil: function MockRectangleStencil() {
    return null;
  },
  ImageRestriction: {
    fillArea: "fillArea",
    fitArea: "fitArea",
    stencil: "stencil",
    none: "none",
  },
}));

vi.mock("@cloudinary/url-gen", () => {
  const mockImg = {
    delivery: vi.fn().mockReturnThis(),
    toURL: vi.fn().mockReturnValue("https://res.cloudinary.com/test/image/upload/f_auto/test-id"),
  };
  class MockCloudinary {
    image() { return mockImg; }
  }
  return { Cloudinary: MockCloudinary };
});

vi.mock("@cloudinary/url-gen/actions/delivery", () => ({
  format: vi.fn().mockReturnValue("format-action"),
}));

vi.mock("@cloudinary/url-gen/qualifiers/format", () => ({
  auto: vi.fn().mockReturnValue("auto-format"),
}));

import CropOverlay from "../CropOverlay";

const DEFAULT_PROPS = {
  cloudinaryPublicId: "test-id",
  cloudName: "test-cloud",
  initialCrop: null,
  onSave: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
};

describe("CropOverlay", () => {
  beforeEach(() => {
    lastCropperProps = null;
  });

  it("renders the crop editor", () => {
    render(<CropOverlay {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("mock-cropper")).toBeInTheDocument();
  });

  // Regression for #737: the crop must be free-form — no fixed aspect ratio
  // imposed on the stencil.
  it("uses free-form cropping (no fixed aspect ratio)", () => {
    render(<CropOverlay {...DEFAULT_PROPS} />);
    const stencilProps = lastCropperProps?.stencilProps ?? {};
    expect(stencilProps.aspectRatio).toBeUndefined();
    expect(stencilProps.minAspectRatio).toBeUndefined();
    expect(stencilProps.maxAspectRatio).toBeUndefined();
  });

  it("Cancel button calls onCancel without calling onSave", async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <CropOverlay {...DEFAULT_PROPS} onCancel={onCancel} onSave={onSave} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save Crop persists the free-form crop with independent width/height", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CropOverlay {...DEFAULT_PROPS} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save Crop"));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [crop] = onSave.mock.calls[0];
    // fakeCropper: {left:10, top:20, width:30, height:40} over a 100×100 image.
    expect(crop).toMatchObject({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    // Crucially, width !== height — a fixed aspect ratio could not produce this.
    expect(crop.width).not.toBe(crop.height);
  });
});
