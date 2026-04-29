import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportOcrStage from "../glazeImportTool/GlazeImportOcrStage";
import type { UploadedRecord } from "../glazeImportTool/glazeImportToolTypes";
import {
  autoDetectOcrRegionForRecord,
  runOcrOnRecord,
} from "../glazeImportTool/glazeImportToolProcessing";

vi.mock("../glazeImportTool/glazeImportToolProcessing", () => ({
  autoDetectOcrRegionForRecord: vi.fn(),
  runOcrOnRecord: vi.fn(),
}));

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
  function OcrStageHarness() {
    const [records, setRecords] = useState([
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
    ]);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>("rec-1");
    const selected = records.find((record) => record.id === selectedRecordId) ?? null;

    return (
      <>
        <GlazeImportOcrStage
          records={records}
          selectedRecordId={selectedRecordId}
          cropPreviewLoading={false}
          cropPreviewUrl="blob:preview"
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={vi.fn()}
          onClearImportResult={vi.fn()}
          onContinueToReview={vi.fn()}
        />
        <output data-testid="ocr-probe">
          {selected
            ? `${selected.ocrTuning.labelWhiteThreshold.toFixed(2)}|${selected.ocrTuning.textDarkThreshold.toFixed(2)}|${selected.ocrRegion?.x},${selected.ocrRegion?.y},${selected.ocrRegion?.width},${selected.ocrRegion?.height}|${selected.ocrSuggestion?.suggestedName ?? "none"}`
            : "none"}
        </output>
      </>
    );
  }

  it("updates sliders, runs and reruns OCR, auto-detects the region, and drags OCR handles", async () => {
    vi.mocked(runOcrOnRecord).mockResolvedValue({
      text: "1st Glaze: Iron Red\n2nd Glaze: Clear\nCAUTION RUNS",
      confidence: 84,
    });
    vi.mocked(autoDetectOcrRegionForRecord).mockResolvedValue({
      ocrRegion: { x: 30, y: 40, width: 150, height: 70, rotation: 0 },
      labelRect: null,
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 640,
        height: 640,
        right: 640,
        bottom: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    render(<OcrStageHarness />);

    expect(
      screen.queryByRole("button", { name: "Run OCR For All Records" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset OCR Region" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("region set")).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("slider")[0], {
      target: { value: "0.9" },
    });
    fireEvent.change(screen.getAllByRole("slider")[1], {
      target: { value: "0.5" },
    });
    expect(screen.getByTestId("ocr-probe")).toHaveTextContent("0.90|0.55|");

    await userEvent.click(screen.getByRole("button", { name: "Auto-detect Region" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocr-probe")).toHaveTextContent("30,40,150,70"),
    );

    fireEvent.pointerDown(screen.getByTestId("ocr-handle-nw"), {
      clientX: 30,
      clientY: 40,
    });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 60 });
    fireEvent.pointerUp(window);
    expect(screen.getByTestId("ocr-probe")).toHaveTextContent("50,60,130,50");

    await userEvent.click(screen.getAllByRole("button", { name: "Run OCR" })[0]);
    await waitFor(() =>
      expect(screen.getByText("Parsed as: Iron Red!Clear")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Re-run OCR" })[0]);

    expect(runOcrOnRecord).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ash Blue • confidence 91%")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-probe")).toHaveTextContent("Iron Red!Clear");
  });
});
