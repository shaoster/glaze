import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportReviewStage from "../GlazeImportReviewStage";
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
    ocrSuggestion: {
      rawText: "Ash Blue",
      suggestedName: "Ash Blue",
      suggestedKind: "glaze_type",
      suggestedFirstGlaze: "",
      suggestedSecondGlaze: "",
      confidence: 91,
    },
    reviewed: false,
    ocrStatus: "done",
    ocrError: null,
    sourceKind: "local",
    cloudinaryPublicId: null,
    ...overrides,
  };
}

describe("GlazeImportReviewStage", () => {
  it("uses the larger review button instead of the tiny checkbox", async () => {
    const onToggleReviewed = vi.fn();

    render(
      <GlazeImportReviewStage
        records={[makeRecord()]}
        selectedRecordId="rec-1"
        selectedRecord={makeRecord()}
        cropPreviewLoading={false}
        cropPreviewUrl="blob:preview"
        allReviewed={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onToggleReviewed={onToggleReviewed}
        onContinueToImport={vi.fn()}
        onUpdateSelectedRecord={vi.fn()}
      />,
    );

    expect(
      screen.queryByLabelText(
        "This record has been reviewed and is ready for import.",
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Mark reviewed for import" }),
    );

    expect(onToggleReviewed).toHaveBeenCalledTimes(1);
  });
});
