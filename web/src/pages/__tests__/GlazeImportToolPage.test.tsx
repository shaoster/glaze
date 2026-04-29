import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlazeImportToolPage from "../GlazeImportToolPage";
import {
  fetchCloudinaryWidgetConfig,
  importManualSquareCropRecords,
} from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchCloudinaryWidgetConfig: vi.fn(),
  importManualSquareCropRecords: vi.fn(),
  signCloudinaryWidgetParams: vi.fn(),
}));
import { createWorker } from "tesseract.js";

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(),
}));

class MockImage {
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  crossOrigin = "";
  naturalWidth = 640;
  naturalHeight = 480;

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

describe("GlazeImportToolPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({
        save: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
        restore: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: vi.fn((callback: BlobCallback) =>
        callback(new Blob(["preview"], { type: "image/webp" })),
      ),
    });
    window.cloudinary = undefined;
  });

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

  it("uploads local files and moves into the crop step", async () => {
    const { container } = render(<GlazeImportToolPage />);

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["image-bytes"], "celadon.png", {
      type: "image/png",
    });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "2. Crop" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("celadon.png")).toBeInTheDocument();
    });
  });

  it("shows an error when the Cloudinary config request fails", async () => {
    vi.mocked(fetchCloudinaryWidgetConfig).mockRejectedValue(new Error("nope"));

    render(<GlazeImportToolPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load Cloudinary upload configuration."),
      ).toBeInTheDocument();
    });
  });

  it("shows an error when the Cloudinary widget is unavailable", async () => {
    vi.mocked(fetchCloudinaryWidgetConfig).mockResolvedValue({
      cloud_name: "demo-cloud",
      api_key: "demo-key",
    });

    render(<GlazeImportToolPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Cloudinary upload widget is not available in this browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("creates a record from a successful Cloudinary widget upload", async () => {
    const openMock = vi.fn();
    window.cloudinary = {
      createUploadWidget: vi.fn((_options, callback) => ({
        open: () => {
          openMock();
          callback(null, {
            event: "success",
            info: {
              public_id: "glaze/public-id",
              original_filename: "ash-blue",
              format: "jpg",
            },
          });
        },
        close: () => {},
        destroy: () => {},
      })),
      openUploadWidget: vi.fn(),
    };
    vi.mocked(fetchCloudinaryWidgetConfig).mockResolvedValue({
      cloud_name: "demo-cloud",
      api_key: "demo-key",
    });

    render(<GlazeImportToolPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    );

    await waitFor(() => {
      expect(openMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("ash-blue.jpg")).toBeInTheDocument();
    });
    expect(window.cloudinary?.createUploadWidget).toHaveBeenCalled();
  });

  it("shows that no records have been uploaded yet on first render", () => {
    render(<GlazeImportToolPage />);

    expect(screen.getByText("No records uploaded yet.")).toBeInTheDocument();
  });

  it("lets the user continue from upload back into crop after files exist", async () => {
    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "tenmoku.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "2. Crop" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    await userEvent.click(screen.getByRole("tab", { name: "1. Upload" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To Crop" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "2. Crop" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("supports creating a crop and continuing to OCR", async () => {
    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "oribe.png", { type: "image/png" });

    fireEvent.change(input!, { target: { files: [file] } });

    await screen.findByText("oribe.png");
    await userEvent.click(screen.getByText("oribe.png"));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue To OCR" }),
      ).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Continue To OCR" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "3. OCR" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("runs OCR and advances into review-ready state", async () => {
    vi.mocked(createWorker).mockResolvedValue({
      writeText: vi.fn().mockResolvedValue(undefined),
      setParameters: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: "1st Glaze: Iron Red\n2nd Glaze: Clear\nCAUTION RUNS",
          confidence: 84,
        },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "combo.png", { type: "image/png" });

    fireEvent.change(input!, { target: { files: [file] } });

    await screen.findByText("combo.png");
    await userEvent.click(screen.getByText("combo.png"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To OCR" }),
    );
    await userEvent.click((await screen.findAllByText("combo.png"))[0]);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Run OCR" }))[0],
    );

    await waitFor(() =>
      expect(screen.getByText("Parsed as: Iron Red!Clear")).toBeInTheDocument(),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To Review" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "4. Review" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    await userEvent.click(await screen.findByText("Iron Red!Clear"));
    expect(screen.getByDisplayValue("glaze_combination")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Iron Red")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Clear")).toBeInTheDocument();
  });

  it("shows an error when the Cloudinary widget callback fails", async () => {
    window.cloudinary = {
      createUploadWidget: vi.fn((_options, callback) => ({
        open: vi.fn(() => {
          callback(new Error("upload failed"), null);
        }),
        close: () => {},
        destroy: () => {},
      })),
      openUploadWidget: vi.fn(),
    };
    vi.mocked(fetchCloudinaryWidgetConfig).mockResolvedValue({
      cloud_name: "demo-cloud",
      api_key: "demo-key",
    });

    render(<GlazeImportToolPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Cloudinary upload failed.")).toBeInTheDocument();
    });
  });

  it("shows duplicate import results and the reconcile shortcut", async () => {
    vi.mocked(createWorker).mockResolvedValue({
      writeText: vi.fn().mockResolvedValue(undefined),
      setParameters: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({
        data: { text: "Ash Blue", confidence: 91 },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.mocked(importManualSquareCropRecords).mockResolvedValue({
      summary: {
        created_glaze_types: 0,
        created_glaze_combinations: 0,
        skipped_duplicates: 1,
        errors: 0,
      },
      results: [
        {
          image_url: "example.com/image.png",
          client_id: "mock-client-id",
          filename: "ash-blue.png",
          name: "Ash Blue",
          kind: "glaze_type",
          status: "skipped_duplicate",
          reason: "Already exists",
          object_id: "123",
        },
      ],
    });

    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "ash-blue.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    await screen.findByText("ash-blue.png");
    await userEvent.click(screen.getByText("ash-blue.png"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To OCR" }),
    );
    await userEvent.click((await screen.findAllByText("ash-blue.png"))[0]);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Run OCR" }))[0],
    );
    await waitFor(() =>
      expect(screen.getByText("Parsed as: Ash Blue")).toBeInTheDocument(),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To Review" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "4. Review" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    await userEvent.click((await screen.findAllByText("Ash Blue"))[0]);
    await userEvent.click(
      await screen.findByRole("button", { name: "Mark reviewed for import" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue To Import" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Run Bulk Import" }),
    );

    await waitFor(() =>
      expect(screen.getByText("1 duplicates skipped")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Reconcile Duplicates →" }),
    ).toBeInTheDocument();
  });
});
