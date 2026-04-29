import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
    cloudinaryPublicId: null,
    ...overrides,
  };
}

describe("GlazeImportCropStage", () => {
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
    expect(screen.getByText("Create a crop to preview the transparency-safe square result.")).toBeInTheDocument();
  });

  it("handles the back button and updates crop geometry through a handle drag", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 752,
        height: 592,
        right: 752,
        bottom: 592,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    render(<CropStageHarness />);

    expect(screen.getByTestId("selected-id")).toHaveTextContent("record-1");
    await userEvent.click(screen.getByRole("button", { name: "← Back to Records" }));
    expect(screen.getByTestId("selected-id")).toHaveTextContent("none");

    await userEvent.click(screen.getByText("Oribe"));
    expect(screen.getByTestId("crop-probe")).toHaveTextContent("0,0,640");

    fireEvent.pointerDown(screen.getByTestId("crop-handle-nw"), {
      clientX: 56,
      clientY: 56,
    });
    fireEvent.pointerMove(window, { clientX: 156, clientY: 156 });
    fireEvent.pointerUp(window);

    expect(screen.getByTestId("crop-probe")).toHaveTextContent("100,100,540");
  });
});
