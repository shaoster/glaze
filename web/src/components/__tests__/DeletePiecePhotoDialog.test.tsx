import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DeletePiecePhotoDialog from "../DeletePiecePhotoDialog";

describe("DeletePiecePhotoDialog", () => {
  it("closes from the dialog backdrop when not deleting", () => {
    const onCancel = vi.fn();

    render(
      <DeletePiecePhotoDialog
        open
        deleting={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not close from escape while deleting", () => {
    const onCancel = vi.fn();

    render(
      <DeletePiecePhotoDialog
        open
        deleting
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onCancel).not.toHaveBeenCalled();
  });
});
