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
        imageId="img-1"
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
        imageId="img-1"
      />,
    );
    expect(screen.queryByText("Report Bad Crop")).toBeNull();
  });

  it("calls createHumanCropRun with imageId and notes on submit", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    mockCreate.mockResolvedValueOnce(undefined);

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        imageId="img-abc"
      />,
    );

    const notesInput = screen.getByRole("textbox");
    fireEvent.change(notesInput, { target: { value: "wrong subject" } });

    const reportButton = screen.getByRole("button", { name: "Report" });
    fireEvent.click(reportButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        image_id: "img-abc",
        notes: "wrong subject",
      });
    });
  });

  it("shows success alert after submission", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    mockCreate.mockResolvedValueOnce(undefined);

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        imageId="img-abc"
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
        imageId="img-abc"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    await waitFor(() => {
      expect(screen.getByText("server error")).toBeTruthy();
    });
  });

  it("disables buttons while submitting", async () => {
    const mockCreate = vi.mocked(api.createHumanCropRun);
    let resolveSubmit: () => void;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmit = () => resolve(undefined);
        }),
    );

    render(
      <ReportBadCropDialog
        open
        onClose={vi.fn()}
        imageId="img-abc"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Report" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submitting…" })).toBeTruthy();
    });

    await act(async () => {
      resolveSubmit!();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <ReportBadCropDialog
        open
        onClose={onClose}
        imageId="img-abc"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
