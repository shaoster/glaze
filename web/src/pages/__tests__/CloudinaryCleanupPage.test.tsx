import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, describe, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CloudinaryCleanupPage from "../CloudinaryCleanupPage";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  scanCloudinaryCleanupAssets: vi.fn(),
  deleteCloudinaryCleanupAssets: vi.fn(),
}));

describe("CloudinaryCleanupPage", () => {
  it("renders and handles scan and delete flow", async () => {
    const mockAssets: api.CloudinaryCleanupAsset[] = [
      {
        public_id: "asset1",
        cloud_name: "cloud1",
        url: "url1",
        thumbnail_url: "",
        bytes: 1024,
        created_at: "2023-01-01",
        path_prefix: "p",
      },
      {
        public_id: "asset2",
        cloud_name: "cloud1",
        url: "url2",
        thumbnail_url: "",
        bytes: 2048,
        created_at: "2023-01-02",
        path_prefix: "p",
      },
    ];

    vi.mocked(api.scanCloudinaryCleanupAssets).mockResolvedValue({
      assets: mockAssets,
      summary: {
        total: 10,
        referenced: 8,
        unused: 2,
        referenced_breakdown: [],
        reference_warnings: [],
      },
    });

    render(
      <MemoryRouter>
        <CloudinaryCleanupPage />
      </MemoryRouter>,
    );

    const scanButton = screen.getByRole("button", { name: /Scan Assets/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText("asset1")).toBeDefined();
    });

    expect(screen.getByText("1.0 KB")).toBeDefined();

    // Deselect asset2 so only asset1 is selected
    const checkbox = screen.getByLabelText("Select asset2");
    fireEvent.click(checkbox);

    const deleteButton = screen.getByRole("button", {
      name: /Delete Selected \(1\)/i,
    });
    fireEvent.click(deleteButton);

    // Confirm delete in dialog
    const confirmButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.deleteCloudinaryCleanupAssets).toHaveBeenCalledWith([
        "asset1",
      ]);
    });
  });
  it("handles select all and deselect all", async () => {
    const mockAssets: api.CloudinaryCleanupAsset[] = [
      {
        public_id: "asset1",
        cloud_name: "cloud1",
        url: "url1",
        thumbnail_url: "",
        bytes: 1024,
        created_at: "2023-01-01",
        path_prefix: "p",
      },
      {
        public_id: "asset2",
        cloud_name: "cloud1",
        url: "url2",
        thumbnail_url: "",
        bytes: 2048,
        created_at: "2023-01-02",
        path_prefix: "p",
      },
    ];

    vi.mocked(api.scanCloudinaryCleanupAssets).mockResolvedValue({
      assets: mockAssets,
      summary: {
        total: 10,
        referenced: 8,
        unused: 2,
        referenced_breakdown: [],
        reference_warnings: [],
      },
    });

    render(
      <MemoryRouter>
        <CloudinaryCleanupPage />
      </MemoryRouter>,
    );

    const scanButton = screen.getByRole("button", { name: /Scan Assets/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText("asset1")).toBeDefined();
    });

    const selectAllCheckbox = screen.getByLabelText("Select all on this page");
    
    // Deselect all
    fireEvent.click(selectAllCheckbox);
    expect(screen.getByRole("button", { name: /Delete Selected \(0\)/i })).toBeDefined();

    // Select all
    fireEvent.click(selectAllCheckbox);
    expect(screen.getByRole("button", { name: /Delete Selected \(2\)/i })).toBeDefined();
  });

  it("handles scan failure", async () => {
    vi.mocked(api.scanCloudinaryCleanupAssets).mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <CloudinaryCleanupPage />
      </MemoryRouter>,
    );

    const scanButton = screen.getByRole("button", { name: /Scan Assets/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText("Unable to scan Cloudinary assets.")).toBeDefined();
    });
  });

  it("handles delete failure", async () => {
    const mockAssets: api.CloudinaryCleanupAsset[] = [
      {
        public_id: "asset1",
        cloud_name: "cloud1",
        url: "url1",
        thumbnail_url: "",
        bytes: 1024,
        created_at: "2023-01-01",
        path_prefix: "p",
      },
    ];

    vi.mocked(api.scanCloudinaryCleanupAssets).mockResolvedValue({
      assets: mockAssets,
      summary: {
        total: 10,
        referenced: 8,
        unused: 2,
        referenced_breakdown: [],
        reference_warnings: [],
      },
    });

    vi.mocked(api.deleteCloudinaryCleanupAssets).mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <CloudinaryCleanupPage />
      </MemoryRouter>,
    );

    const scanButton = screen.getByRole("button", { name: /Scan Assets/i });
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText("asset1")).toBeDefined();
    });

    const deleteButton = screen.getByRole("button", {
      name: /Delete Selected \(1\)/i,
    });
    fireEvent.click(deleteButton);

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Unable to delete the selected assets.")).toBeDefined();
    });
  });
});
