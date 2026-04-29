import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportOcrStage from "../GlazeImportOcrStage";
import type { UploadedRecord } from "../glazeImportToolTypes";

function makeRecord(
  overrides: Partial<UploadedRecord> = {},
): UploadedRecord {
  return {
    id: "rec-1",
    file: null,
    sourceUrl: "https://example.com/record.png",
    filename: "record.png",
    dimensions: { width: 640, height: 640 },
    crop: { x: 0, y: 0, size: 640, rotation: 0 },
    cropped: true,
    detectedLabelRect: null,
    ocrRegion: { x: 10, y: 20, width: 200, height: 90, rotation: 0 },
    ocrTuning: { labelWhiteThreshold: 0.77, textDarkThreshold: 0.43 },
    parsedFields: {
      name: "Ash Blue",
      kind: "glaze_type",
      first_glaze: "",
      second_glaze: "",
      runs: null,
      is_food_safe: null,
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

describe("GlazeImportOcrStage", () => {
  it("renders per-record OCR actions and omits the old bulk controls", async () => {
    const onRunOcr = vi.fn();

    render(
      <GlazeImportOcrStage
        records={[
          makeRecord(),
          makeRecord({
            id: "rec-2",
            filename: "second.png",
            ocrStatus: "done",
            ocrSuggestion: {
              rawText: "Ash Blue",
              suggestedName: "Ash Blue",
              suggestedKind: "glaze_type",
              suggestedFirstGlaze: "",
              suggestedSecondGlaze: "",
              confidence: 91,
            },
          }),
        ]}
        selectedRecordId="rec-1"
        selectedRecord={makeRecord()}
        selectedCrop={{ x: 0, y: 0, size: 640, rotation: 0 }}
        selectedOcrRegion={{ x: 10, y: 20, width: 200, height: 90, rotation: 0 }}
        cropPreviewLoading={false}
        cropPreviewUrl="blob:preview"
        ocrStageRef={createRef<HTMLDivElement>()}
        ocrStageScale={1}
        runningOcrRecordId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onAutoDetectRegion={vi.fn()}
        onRunOcr={onRunOcr}
        onContinueToReview={vi.fn()}
        onStartOcrDrag={vi.fn()}
        onUpdateSelectedLabelSensitivity={vi.fn()}
        onUpdateSelectedTextSensitivity={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Run OCR For All Records" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset OCR Region" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("region set")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Run OCR" })[0]);

    expect(onRunOcr).toHaveBeenCalledWith("rec-1");
    expect(screen.getByText("Ash Blue • confidence 91%")).toBeInTheDocument();
  });
});
