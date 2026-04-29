import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportReviewStage from "../glazeImportTool/GlazeImportReviewStage";
import type { UploadedRecord } from "../glazeImportTool/glazeImportToolTypes";

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
  function ReviewStageHarness() {
    const [records, setRecords] = useState([makeRecord()]);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>("rec-1");
    const selected = records[0];

    return (
      <>
        <GlazeImportReviewStage
          records={records}
          selectedRecordId={selectedRecordId}
          cropPreviewLoading={false}
          cropPreviewUrl="blob:preview"
          allReviewed={records.every((record) => record.reviewed)}
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={vi.fn()}
          onContinueToImport={vi.fn()}
        />
        <output data-testid="review-probe">
          {`${selected.parsedFields.kind}|${selected.parsedFields.name}|${selected.parsedFields.first_glaze}|${selected.parsedFields.second_glaze}|${selected.reviewed}`}
        </output>
      </>
    );
  }

  it("updates parsed fields and uses the larger review button instead of the tiny checkbox", async () => {
    render(<ReviewStageHarness />);

    expect(
      screen.queryByLabelText(
        "This record has been reviewed and is ready for import.",
      ),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Parsed name"));
    await userEvent.type(screen.getByLabelText("Parsed name"), "New Name");
    expect(screen.getByTestId("review-probe")).toHaveTextContent(
      "glaze_type|New Name|||false",
    );

    await userEvent.selectOptions(screen.getByLabelText("Parsed kind"), [
      "glaze_combination",
    ]);
    expect(screen.getByTestId("review-probe")).toHaveTextContent(
      "glaze_combination|!||",
    );

    await userEvent.type(screen.getByLabelText("Parsed 1st glaze"), "Iron Red");
    await userEvent.type(screen.getByLabelText("Parsed 2nd glaze"), "Clear");
    expect(screen.getByTestId("review-probe")).toHaveTextContent(
      "glaze_combination|Iron Red!Clear|Iron Red|Clear|false",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Mark reviewed for import" }),
    );

    expect(screen.getByTestId("review-probe")).toHaveTextContent("true");
  });
});
