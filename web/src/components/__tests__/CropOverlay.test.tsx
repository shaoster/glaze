import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-easy-crop", () => ({
  default: function MockCropper({ onMediaLoaded }: any) {
    const onMediaLoadedRef = React.useRef(onMediaLoaded);
    React.useEffect(() => {
      onMediaLoadedRef.current?.({ naturalWidth: 100, naturalHeight: 100 });
    }, []);
    return <div data-testid="mock-cropper" />;
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
  it("renders the crop editor", () => {
    render(<CropOverlay {...DEFAULT_PROPS} />);
    expect(screen.getByTestId("mock-cropper")).toBeInTheDocument();
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

  it("Save Crop button calls onSave with a valid crop", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CropOverlay {...DEFAULT_PROPS} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save Crop"));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [crop] = onSave.mock.calls[0];
    expect(crop).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });
});
