import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportBadCropDialog from "../ReportBadCropDialog";

vi.mock("../../util/api", () => ({
  createHumanCropRun: vi.fn(),
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : "An unexpected error occurred.",
}));

import * as api from "../../util/api";

describe("ReportBadCropDialog", () => {
  it("renders the dialog when open", () => {
    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        pieceStateImageId="psi-1"
        initialCrop={{ x: 0.1, y: 0.2, width: 0.8, height: 0.6 }}
      />,
    );
    expect(screen.getByText("Report Bad Crop")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
  });

  it("does not render content when closed", () => {
    render(
      <ReportBadCropDialog
        open={false}
        onClose={vi.fn()}
        pieceStateImageId="psi-1"
      />,
    );
    expect(screen.queryByText("Report Bad Crop")).toBeNull();
  });

  it("calls createHumanCropRun with imageId, crop, and notes on submit", async () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    const mockCreate = vi.mocked(api.createHumanCropRun);
    mockCreate.mockResolvedValueOnce({
      id: "run-1",
      piece_state_image_id: "psi-abc",
      source: {
        type: "human",
        backend: null,
        deployment: "web-ui",
        version: null,
      },
      crop,
      status: "success",
      created: new Date(),
    });

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        pieceStateImageId="psi-abc"
        initialCrop={crop}
      />,
    );

    const notesInput = screen.getByRole("textbox", { name: /notes/i });
    fireEvent.change(notesInput, { target: { value: "wrong subject" } });

    const reportButton = screen.getByRole("button", { name: "Report" });
    fireEvent.click(reportButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        piece_state_image_id: "psi-abc",
        crop,
        notes: "wrong subject",
      });
    });
  });

  it("shows success alert after submission", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    mockCreate.mockResolvedValueOnce({
      id: "run-1",
      piece_state_image_id: "psi-abc",
      source: {
        type: "human",
        backend: null,
        deployment: "web-ui",
        version: null,
      },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      status: "success",
      created: new Date(),
    });

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        pieceStateImageId="psi-abc"
        initialCrop={{ x: 0, y: 0, width: 1, height: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    await waitFor(() => {
      expect(screen.getByText("Thank you for your feedback!")).toBeTruthy();
    });
  });

  it("shows error alert when submission fails", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    mockCreate.mockRejectedValueOnce(new Error("server error"));

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        pieceStateImageId="psi-abc"
        initialCrop={{ x: 0, y: 0, width: 1, height: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    await waitFor(() => {
      expect(screen.getByText("server error")).toBeTruthy();
    });
  });

  it("disables buttons while submitting", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    let resolveSubmit: (() => void) | undefined;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmit = () => resolve({
            id: "run-1",
            piece_state_image_id: "psi-abc",
            source: {
              type: "human",
              backend: null,
              deployment: "web-ui",
              version: null,
            },
            crop: { x: 0, y: 0, width: 1, height: 1 },
            status: "success",
            created: new Date(),
          });
        }),
    );

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        pieceStateImageId="psi-abc"
        initialCrop={{ x: 0, y: 0, width: 1, height: 1 }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Report" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submitting…" })).toBeTruthy();
    });

    await act(async () => {
      resolveSubmit?.();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <ReportBadCropDialog
        open
        onClose={onClose}
        pieceStateImageId="psi-abc"
        initialCrop={{ x: 0, y: 0, width: 1, height: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
