import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportUploadStage from "../glazeImportTool/GlazeImportUploadStage";
import type { UploadedRecord } from "../glazeImportTool/glazeImportToolTypes";

function makeRecord(overrides: Partial<UploadedRecord> = {}): UploadedRecord {
  return {
    id: "record-1",
    file: null,
    sourceUrl: "https://example.com/image.jpg",
    filename: "ash-blue.jpg",
    dimensions: { width: 640, height: 480 },
    crop: null,
    cropped: false,
    ocrRegion: null,
    ocrTuning: { labelWhiteThreshold: 0.83, textDarkThreshold: 0.4 },
    parsedFields: {
      name: "",
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

describe("GlazeImportUploadStage", () => {
  it("shows the empty upload state", () => {
    render(
      <GlazeImportUploadStage
        fileInputRef={createRef<HTMLInputElement>()}
        uploading={false}
        widgetUploading={false}
        widgetError={null}
        uploadProgress={[]}
        records={[]}
        selectedRecordId={null}
        onFileSelection={vi.fn()}
        onStartCloudinaryUpload={vi.fn()}
        onContinueToCrop={vi.fn()}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("No records uploaded yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue To Crop" }),
    ).not.toBeInTheDocument();
  });

  it("shows progress and lets the user continue once records exist", async () => {
    const onContinueToCrop = vi.fn();

    render(
      <GlazeImportUploadStage
        fileInputRef={createRef<HTMLInputElement>()}
        uploading={false}
        widgetUploading={false}
        widgetError={null}
        uploadProgress={[
          {
            id: "progress-1",
            filename: "ash-blue.jpg",
            status: "processing",
            progress: 60,
            error: null,
          },
        ]}
        records={[makeRecord()]}
        selectedRecordId={null}
        onFileSelection={vi.fn()}
        onStartCloudinaryUpload={vi.fn()}
        onContinueToCrop={onContinueToCrop}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Upload Progress")).toBeInTheDocument();
    expect(screen.getByText("Reading metadata…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue To Crop" }));
    expect(onContinueToCrop).toHaveBeenCalled();
  });
});
