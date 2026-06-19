import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios");
vi.mock("../api", () => ({
  fetchR2PresignedUrl: vi.fn(),
  getR2ConversionStatus: vi.fn(),
  triggerR2ImageConversion: vi.fn(),
}));

import axios from "axios";
import {
  fetchR2PresignedUrl,
  getR2ConversionStatus,
  triggerR2ImageConversion,
} from "../api";
import { MAX_UPLOAD_LONG_EDGE, uploadImageToR2 } from "../r2Upload";

const mockAxiosPost = vi.mocked(axios.post);
const mockFetchPresigned = vi.mocked(fetchR2PresignedUrl);
const mockGetConversionStatus = vi.mocked(getR2ConversionStatus);
const mockTriggerConversion = vi.mocked(triggerR2ImageConversion);

const PRESIGNED = {
  upload_url: "https://r2.example.com/upload",
  public_url: "https://cdn.example.com/image.jpg",
  key: "images/abc.jpg",
  fields: { key: "images/abc.jpg", policy: "base64policy" },
};

function makeJpegFile(name = "photo.jpg", size = 100): File {
  return new File(["x".repeat(size)], name, { type: "image/jpeg" });
}

function makeFile(name: string, type: string): File {
  return new File(["x"], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAxiosPost.mockResolvedValue({});
  mockFetchPresigned.mockResolvedValue(PRESIGNED);
});

describe("MAX_UPLOAD_LONG_EDGE", () => {
  it("is exported as 2560", () => {
    expect(MAX_UPLOAD_LONG_EDGE).toBe(2560);
  });
});

describe("uploadImageToR2 — browser-decodable JPEG within size cap", () => {
  it("uploads via presigned POST and returns the public URL without conversion", async () => {
    const bitmap = {
      width: 800,
      height: 600,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }),
      toBlob: vi.fn(
        (
          cb: (b: Blob | null) => void,
          _type: string,
          _quality: number,
        ) => cb(new Blob(["img"], { type: "image/jpeg" })),
      ),
    };
    vi.stubGlobal(
      "document",
      Object.assign({}, globalThis.document, {
        createElement: () => canvas,
        cookie: "",
      }),
    );

    const file = makeJpegFile();
    const result = await uploadImageToR2(file);

    expect(mockFetchPresigned).toHaveBeenCalledWith("image/jpeg");
    expect(mockAxiosPost).toHaveBeenCalledWith(
      PRESIGNED.upload_url,
      expect.any(FormData),
    );
    expect(result.url).toBe(PRESIGNED.public_url);
    vi.unstubAllGlobals();
  });
});

describe("uploadImageToR2 — non-JPEG re-encodes via canvas", () => {
  it("canvas-encodes a PNG and returns the presigned URL directly", async () => {
    const bitmap = {
      width: 800,
      height: 600,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const mockBlob = new Blob(["img"], { type: "image/jpeg" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }),
      toBlob: vi.fn(
        (cb: (b: Blob | null) => void) => cb(mockBlob),
      ),
    };
    vi.stubGlobal(
      "document",
      Object.assign({}, globalThis.document, {
        createElement: () => canvas,
        cookie: "",
      }),
    );

    const pngFile = makeFile("photo.png", "image/png");
    const result = await uploadImageToR2(pngFile);

    expect(result.url).toBe(PRESIGNED.public_url);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    vi.unstubAllGlobals();
  });

  it("falls back to server conversion when canvas.getContext returns null", async () => {
    const bitmap = {
      width: 800,
      height: 600,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
    };
    vi.stubGlobal(
      "document",
      Object.assign({}, globalThis.document, {
        createElement: () => canvas,
        cookie: "",
      }),
    );

    const pngFile = makeFile("photo.png", "image/png");
    mockTriggerConversion.mockResolvedValue({
      task_id: "task-ctx",
      needs_conversion: true,
    });
    mockGetConversionStatus.mockResolvedValue({
      status: "success",
      result: {
        url: "https://cdn.example.com/converted.jpg",
        width: 800,
        height: 600,
      },
    });

    vi.useFakeTimers();
    const resultPromise = uploadImageToR2(pngFile);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.url).toBe("https://cdn.example.com/converted.jpg");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("downscales oversized images before canvas-encoding", async () => {
    const bitmap = {
      width: 4000,
      height: 3000,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const mockBlob = new Blob(["img"], { type: "image/jpeg" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }),
      toBlob: vi.fn(
        (cb: (b: Blob | null) => void) => cb(mockBlob),
      ),
    };
    vi.stubGlobal(
      "document",
      Object.assign({}, globalThis.document, {
        createElement: () => canvas,
        cookie: "",
      }),
    );

    const jpegFile = makeJpegFile("large.jpg");
    const result = await uploadImageToR2(jpegFile);

    expect(result.url).toBe(PRESIGNED.public_url);
    expect(result.width).toBe(Math.round(4000 * (2560 / 4000)));
    expect(result.height).toBe(Math.round(3000 * (2560 / 4000)));
    vi.unstubAllGlobals();
  });
});

describe("uploadImageToR2 — browser-opaque format triggers server conversion", () => {
  it("polls until conversion succeeds and returns the converted URL", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported format")),
    );

    const heicFile = makeFile("photo.heic", "image/heic");
    mockTriggerConversion.mockResolvedValue({
      task_id: "task-123",
      needs_conversion: true,
    });
    mockGetConversionStatus
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({
        status: "success",
        result: {
          url: "https://cdn.example.com/converted.jpg",
          width: 1024,
          height: 768,
        },
      });

    vi.useFakeTimers();

    const resultPromise = uploadImageToR2(heicFile, "img-id");

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.url).toBe("https://cdn.example.com/converted.jpg");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
    expect(mockTriggerConversion).toHaveBeenCalledWith("images/abc.jpg", "img-id");

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws when the conversion task fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported")),
    );

    const heicFile = makeFile("photo.heic", "image/heic");
    mockTriggerConversion.mockResolvedValue({
      task_id: "task-456",
      needs_conversion: true,
    });
    mockGetConversionStatus.mockResolvedValue({
      status: "failure",
      error: "conversion failed",
    });

    vi.useFakeTimers();

    const resultPromise = uploadImageToR2(heicFile).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe(
      "Image conversion failed: conversion failed",
    );

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("infers MIME type from extension when file.type is blank", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported")),
    );

    const noTypeFile = new File(["x"], "image.heic", { type: "" });
    mockTriggerConversion.mockResolvedValue({
      task_id: "task-789",
      needs_conversion: false,
    });

    vi.useFakeTimers();

    const resultPromise = uploadImageToR2(noTypeFile);
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(mockFetchPresigned).toHaveBeenCalledWith("image/heic");
    expect(result.url).toBe(PRESIGNED.public_url);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
