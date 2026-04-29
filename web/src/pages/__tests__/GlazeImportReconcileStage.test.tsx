import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportReconcileStage from "../glazeImportTool/GlazeImportReconcileStage";
import type { UploadedRecord } from "../glazeImportTool/glazeImportToolTypes";

function makeRecord(): UploadedRecord {
  return {
    id: "record-1",
    file: null,
    sourceUrl: "https://example.com/image.jpg",
    filename: "ash-blue.jpg",
    dimensions: { width: 640, height: 480 },
    crop: null,
    cropped: true,
    ocrRegion: null,
    ocrTuning: { labelWhiteThreshold: 0.83, textDarkThreshold: 0.4 },
    parsedFields: {
      name: "Ash Blue",
      kind: "glaze_type",
      first_glaze: "",
      second_glaze: "",
      runs: false,
      is_food_safe: true,
    },
    ocrSuggestion: null,
    reviewed: true,
    ocrStatus: "done",
    ocrError: null,
    sourceKind: "local",
    cloudinaryPublicId: null,
  };
}

describe("GlazeImportReconcileStage", () => {
  it("toggles resolved duplicate entries", async () => {
    const onToggleResolved = vi.fn();

    render(
      <GlazeImportReconcileStage
        duplicateResults={[
          {
            client_id: "record-1",
            filename: "ash-blue.jpg",
            kind: "glaze_type",
            name: "Ash Blue",
            status: "skipped_duplicate",
            reason: "Already exists",
            object_id: "123",
            image_url: null,
          },
        ]}
        records={[makeRecord()]}
        reconciledIds={new Set()}
        onToggleResolved={onToggleResolved}
      />,
    );

    expect(screen.getByText("0 / 1 resolved")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Resolved" }));
    expect(onToggleResolved).toHaveBeenCalledWith("record-1", true);
  });
});
