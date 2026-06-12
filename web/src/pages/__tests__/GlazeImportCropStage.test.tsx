import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

let lastCropperProps: any = null;

// Fake cropper handed to onChange. aspectRatio={1} keeps the box square, so
// getCoordinates returns equal width/height.
const fakeCropper = {
  getCoordinates: () => ({ left: 64, top: 48, width: 512, height: 512 }),
  getState: () => ({ imageSize: { width: 640, height: 480 } }),
};

vi.mock("react-advanced-cropper", () => ({
  Cropper: function MockCropper(props: any) {
    lastCropperProps = props;
    return (
      <div
        data-testid="mock-cropper"
        onClick={() => props.onChange?.(fakeCropper)}
      />
    );
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

import GlazeImportCropStage from "../glazeImportTool/GlazeImportCropStage";
import type { UploadedRecord } from "../glazeImportTool/glazeImportToolTypes";

function makeRecord(overrides: Partial<UploadedRecord> = {}): UploadedRecord {
  return {
    id: "record-1",
    file: null,
    sourceUrl: "https://example.com/image.jpg",
    filename: "oribe.jpg",
    dimensions: { width: 640, height: 480 },
    crop: { x: 0, y: 0, size: 640, rotation: 0 },
    cropped: true,
    ocrRegion: null,
    ocrTuning: { labelWhiteThreshold: 0.83, textDarkThreshold: 0.4 },
    parsedFields: {
      name: "Oribe",
      kind: "glaze_type",
      first_glaze: "",
      second_glaze: "",
      runs: false,
      is_food_safe: true,
    },
    ocrSuggestion: null,
    reviewed: false,
    ocrStatus: "idle",
    ocrError: null,
    sourceKind: "local",
    ...overrides,
  };
}

describe("GlazeImportCropStage", () => {
  beforeEach(() => {
    lastCropperProps = null;
  });

  function CropStageHarness() {
    const [records, setRecords] = useState([makeRecord()]);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
      "record-1",
    );
    const selected = records[0];

    return (
      <>
        <GlazeImportCropStage
          records={records}
          selectedRecordId={selectedRecordId}
          allCropped={false}
          cropPreviewLoading={false}
          cropPreviewUrl="blob:preview"
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={vi.fn()}
          onContinueToOcr={vi.fn()}
        />
        <output data-testid="crop-probe">
          {selected.crop
            ? `${selected.crop.x},${selected.crop.y},${selected.crop.size}`
            : "none"}
        </output>
        <output data-testid="selected-id">{selectedRecordId ?? "none"}</output>
      </>
    );
  }

  it("shows the record list when no record is selected", () => {
    render(
      <GlazeImportCropStage
        records={[makeRecord()]}
        selectedRecordId={null}
        allCropped={false}
        cropPreviewLoading={false}
        cropPreviewUrl={null}
        setRecords={vi.fn()}
        setSelectedRecordId={vi.fn()}
        onDelete={vi.fn()}
        onContinueToOcr={vi.fn()}
      />,
    );

    expect(screen.getByText("Oribe")).toBeInTheDocument();
  });

  // The import swatch is square by design (#146): the migration to
  // react-advanced-cropper must preserve the 1:1 lock.
  it("locks the crop stencil to a 1:1 aspect ratio", () => {
    render(<CropStageHarness />);
    const stencilProps = lastCropperProps?.stencilProps ?? {};
    expect(stencilProps.aspectRatio).toBe(1);
  });

  it("handles the back button and updates crop geometry via onChange", async () => {
    render(<CropStageHarness />);

    expect(screen.getByTestId("selected-id")).toHaveTextContent("record-1");
    await userEvent.click(
      screen.getByRole("button", { name: "← Back to Records" }),
    );
    expect(screen.getByTestId("selected-id")).toHaveTextContent("none");

    await userEvent.click(screen.getByText("Oribe"));
    expect(screen.getByTestId("crop-probe")).toHaveTextContent("0,0,640");

    // Simulate a crop change via the mock cropper.
    await userEvent.click(screen.getByTestId("mock-cropper"));

    // coords {left:64, top:48, width:512} → crop.size = 512.
    expect(screen.getByTestId("crop-probe")).toHaveTextContent("64,48,512");
  });
});
