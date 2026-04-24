import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@common/api", () => ({
  fetchCloudinaryWidgetConfig: vi.fn(),
  importManualSquareCropRecords: vi.fn(),
  signCloudinaryWidgetParams: vi.fn(),
}));

import GlazeImportToolPage from "../../pages/GlazeImportToolPage";

describe("GlazeImportToolPage", () => {
  it("renders the tabbed workflow headings", () => {
    render(<GlazeImportToolPage />);

    expect(
      screen.getByRole("heading", { name: "Glaze Import Tool" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "1. Upload" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "2. Crop" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Bulk Upload Images" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    ).toBeInTheDocument();
  });
});
