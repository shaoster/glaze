import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GlazeImportImportStage from "../glazeImportTool/GlazeImportImportStage";

describe("GlazeImportImportStage", () => {
  it("blocks import before all records are reviewed", () => {
    render(
      <GlazeImportImportStage
        allReviewed={false}
        importRunning={false}
        importError={null}
        importBuildProgress={[]}
        importResult={null}
        hasDuplicates={false}
        onRunImport={vi.fn()}
        onGoToReconcile={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Run Bulk Import" })).toBeDisabled();
    expect(screen.getByText("Review every record before importing.")).toBeInTheDocument();
  });

  it("shows duplicate results and links to reconcile", async () => {
    const onGoToReconcile = vi.fn();

    render(
      <GlazeImportImportStage
        allReviewed
        importRunning={false}
        importError={null}
        importBuildProgress={[]}
        hasDuplicates
        onRunImport={vi.fn()}
        onGoToReconcile={onGoToReconcile}
        importResult={{
          summary: {
            created_glaze_types: 0,
            created_glaze_combinations: 1,
            skipped_duplicates: 1,
            errors: 0,
          },
          results: [
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
          ],
        }}
      />,
    );

    expect(screen.getByText("1 duplicates skipped")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconcile Duplicates →" }));
    expect(onGoToReconcile).toHaveBeenCalled();
  });
});
