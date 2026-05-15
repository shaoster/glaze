import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlazeImportToolPage from "../GlazeImportToolPage";
import type { CloudinaryUploadWidgetOptions } from "../../cloudinary-widget";
import {
  fetchCloudinaryWidgetConfig,
  importManualSquareCropRecords,
  signCloudinaryWidgetParams,
} from "../../util/api";

vi.mock("../../util/api", () => ({
  extractErrorMessage: vi.fn((error: unknown, defaultMessage: string) => {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (typeof data === "object" && data !== null) {
      const nonFieldErrors = (data as { non_field_errors?: unknown })
        .non_field_errors;
      if (Array.isArray(nonFieldErrors) && nonFieldErrors[0]) {
        return String(nonFieldErrors[0]);
      }
    }
    return error instanceof Error ? error.message : defaultMessage;
  }),
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
    this.onload?.();
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
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(128 * 128 * 4),
          width: 128,
          height: 128,
        })),
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

  it("deletes an uploaded record after confirmation", async () => {
    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "delete-me.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    await screen.findByText("delete-me.png");
    await userEvent.click(
      screen.getByRole("button", { name: "Delete delete-me.png" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("delete-me.png")).not.toBeInTheDocument();
    });
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
    fireEvent.click(screen.getByText("combo.png"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To OCR" }),
    );
    fireEvent.click((await screen.findAllByText("combo.png"))[0]);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Run OCR" }))[0],
    );

    await waitFor(() =>
      expect(screen.getByText("Parsed as: Iron Red!Clear")).toBeInTheDocument(),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To Review" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "4. Review" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.click(await screen.findByText("Iron Red!Clear"));
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

  it("shows an error when Cloudinary upload signing fails", async () => {
    let uploadSignature:
      | CloudinaryUploadWidgetOptions["uploadSignature"]
      | undefined;
    window.cloudinary = {
      createUploadWidget: vi.fn((options) => {
        uploadSignature = options.uploadSignature;
        return { open: vi.fn(), close: () => {}, destroy: () => {} };
      }),
      openUploadWidget: vi.fn(),
    };
    vi.mocked(fetchCloudinaryWidgetConfig).mockResolvedValue({
      cloud_name: "demo-cloud",
      api_key: "demo-key",
    });
    vi.mocked(signCloudinaryWidgetParams).mockRejectedValue(
      new Error("sign failed"),
    );

    render(<GlazeImportToolPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Upload Via Cloudinary" }),
    );

    await waitFor(() => expect(uploadSignature).toBeDefined());
    uploadSignature?.(vi.fn(), { timestamp: "123" });
    await waitFor(() => {
      expect(
        screen.getByText("Failed to sign Cloudinary upload."),
      ).toBeInTheDocument();
    });
  });

  it("shows formatted API validation errors when import fails", async () => {
    vi.mocked(createWorker).mockResolvedValue({
      writeText: vi.fn().mockResolvedValue(undefined),
      setParameters: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({
        data: { text: "Ash Blue", confidence: 91 },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.mocked(importManualSquareCropRecords).mockRejectedValue({
      isAxiosError: true,
      response: {
        data: { non_field_errors: ["Import records are invalid."] },
      },
    });

    const { container } = render(<GlazeImportToolPage />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["image-bytes"], "ash-blue.png", {
      type: "image/png",
    });

    fireEvent.change(input!, { target: { files: [file] } });
    await screen.findByText("ash-blue.png");
    fireEvent.click(screen.getByText("ash-blue.png"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To OCR" }),
    );
    fireEvent.click((await screen.findAllByText("ash-blue.png"))[0]);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Run OCR" }))[0],
    );
    await screen.findByText("Parsed as: Ash Blue");
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To Review" }),
    );
    const reviewRecordList = screen.getByRole("list");
    fireEvent.click(await within(reviewRecordList).findByText("Ash Blue"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark reviewed for import" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To Import" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Run Bulk Import" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Import records are invalid.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("ash-blue.png"));

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To OCR" }),
    );

    // Wait for the OCR stage to be active and stable
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "3. OCR" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    // Be more specific about what we click in the OCR stage
    const recordList = screen.getByRole("list");
    const recordItem = await within(recordList).findByText("ash-blue.png");
    fireEvent.click(recordItem);

    const runOcrButtons = await screen.findAllByRole("button", { name: "Run OCR" });
    fireEvent.click(runOcrButtons[0]);

    await waitFor(() =>
      expect(screen.getByText("Parsed as: Ash Blue")).toBeInTheDocument(),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To Review" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "4. Review" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    // Select the record in Review stage
    const reviewRecordList = screen.getByRole("list");
    const reviewRecordItem = await within(reviewRecordList).findByText("Ash Blue");
    fireEvent.click(reviewRecordItem);

    fireEvent.click(
      await screen.findByRole("button", { name: "Mark reviewed for import" }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue To Import" }),
    );

    fireEvent.click(
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
