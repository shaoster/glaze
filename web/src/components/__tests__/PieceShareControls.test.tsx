import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareControls from "../PieceShareControls";
import type { PieceDetail } from "../../util/types";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  updatePiece: vi.fn(),
}));

function makePiece(overrides: Partial<PieceDetail> = {}): PieceDetail {
  return {
    id: "piece-id-1",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    shared: false,
    can_edit: true,
    current_state: {
      state: "completed",
      notes: "",
      created: new Date("2024-01-15T10:00:00Z"),
      last_modified: new Date("2024-01-15T10:00:00Z"),
      images: [],
      additional_fields: {},
      previous_state: null,
      next_state: null,
    },
    current_location: "",
    tags: [],
    history: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
  });
});

describe("PieceShareControls", () => {
  it("shares an unshared piece", async () => {
    const updated = makePiece({ shared: true });
    vi.mocked(api.updatePiece).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();

    render(<ShareControls piece={makePiece()} onPieceUpdated={onPieceUpdated} />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        shared: true,
      }),
    );
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
    expect(screen.getByText("Public link created.")).toBeInTheDocument();
  });

  it("shows an error when toggling sharing fails", async () => {
    vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));
    const onPieceUpdated = vi.fn();

    render(<ShareControls piece={makePiece()} onPieceUpdated={onPieceUpdated} />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(
        screen.getByText("Failed to update sharing. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(onPieceUpdated).not.toHaveBeenCalled();
  });

  it("copies the public URL for a shared piece", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ShareControls
        piece={makePiece({ shared: true })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/pieces/piece-id-1",
      ),
    );
    expect(screen.getByText("Public link copied.")).toBeInTheDocument();
  });

  it("shows an error when copying the public URL fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("No clipboard"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ShareControls
        piece={makePiece({ shared: true })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(screen.getByText("Could not copy the public link.")).toBeInTheDocument(),
    );
  });

  it("hides the native share action when Web Share is unavailable", () => {
    render(
      <ShareControls
        piece={makePiece({ shared: true })}
        onPieceUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unshare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("uses piece name and state as share text (no thumbnail)", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    render(
      <ShareControls
        piece={makePiece({ shared: true })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Test Bowl",
        text: "Test Bowl — Completed",
        url: "http://localhost:3000/pieces/piece-id-1",
      }),
    );
  });

  it("includes thumbnail file in native share when Cloudinary image is available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });

    const mockBlob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ blob: () => Promise.resolve(mockBlob) }),
    );

    const thumbnail = {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
    };

    render(
      <ShareControls
        piece={makePiece({ shared: true, thumbnail })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const shareData = share.mock.calls[0][0] as ShareData;
    expect(shareData.text).toBe("Test Bowl — Completed");
    expect(shareData.files).toHaveLength(1);
    expect((shareData.files![0] as File).name).toBe("thumbnail.jpg");
  });

  it("shares without files when thumbnail fetch fails", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const thumbnail = {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
    };

    render(
      <ShareControls
        piece={makePiece({ shared: true, thumbnail })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.not.objectContaining({ files: expect.anything() }),
      ),
    );
  });

  it("shares without files when canShare rejects file sharing", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });

    const mockBlob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ blob: () => Promise.resolve(mockBlob) }),
    );

    const thumbnail = {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
    };

    render(
      <ShareControls
        piece={makePiece({ shared: true, thumbnail })}
        onPieceUpdated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.not.objectContaining({ files: expect.anything() }),
      ),
    );
  });
});
