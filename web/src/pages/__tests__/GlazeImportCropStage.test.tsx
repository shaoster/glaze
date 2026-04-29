import { createRef } from "react";
import { render, screen } from "@testing-library/react";
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
  it("shows the record list when no record is selected", () => {
    render(
      <GlazeImportCropStage
        records={[makeRecord()]}
        selectedRecordId={null}
        selectedRecord={null}
        selectedCrop={null}
        allCropped={false}
        cropPreviewLoading={false}
        cropPreviewUrl={null}
        cropStageRef={createRef<HTMLDivElement>()}
        selectedPadding={80}
        selectedStageWidth={800}
        selectedStageHeight={640}
        selectedStageScale={1}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onBackToRecords={vi.fn()}
        onResetCrop={vi.fn()}
        onContinueToOcr={vi.fn()}
        onStartCropDrag={vi.fn()}
      />,
    );

    expect(screen.getByText("Oribe")).toBeInTheDocument();
    expect(screen.getByText("Create a crop to preview the transparency-safe square result.")).toBeInTheDocument();
  });

  it("exposes crop actions for the selected record", async () => {
    const onResetCrop = vi.fn();
    const onContinueToOcr = vi.fn();

    const record = makeRecord();
    render(
      <GlazeImportCropStage
        records={[record]}
        selectedRecordId={record.id}
        selectedRecord={record}
        selectedCrop={record.crop}
        allCropped
        cropPreviewLoading={false}
        cropPreviewUrl="blob:preview"
        cropStageRef={createRef<HTMLDivElement>()}
        selectedPadding={80}
        selectedStageWidth={800}
        selectedStageHeight={640}
        selectedStageScale={1}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onBackToRecords={vi.fn()}
        onResetCrop={onResetCrop}
        onContinueToOcr={onContinueToOcr}
        onStartCropDrag={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reset Crop" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue To OCR" }));

    expect(onResetCrop).toHaveBeenCalled();
    expect(onContinueToOcr).toHaveBeenCalled();
    expect(screen.getByText("Source: 640 × 480")).toBeInTheDocument();
  });
});
