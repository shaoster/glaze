import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { mountWorkflowStateWidget } from "./admin";
import WorkflowState from "./components/WorkflowState";

// Mock WorkflowState to keep the test focused on mounting and theme logic
vi.mock("./components/WorkflowState", () => ({
  __esModule: true,
  default: vi.fn(() => <div data-testid="mock-workflow-state" />),
}));

describe("admin.tsx - mountWorkflowStateWidget", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.id = "test-container";
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  const validInitialState = {
    id: "piece-state-1",
    state: "wheel_thrown",
    notes: "Original notes",
    custom_fields: { clay_weight_lbs: 1.5 },
  };

  it("attaches itself to the window object", () => {
    expect(window.mountWorkflowStateWidget).toBeDefined();
    expect(typeof window.mountWorkflowStateWidget).toBe("function");
  });

  it("mounts the component into the specified container", async () => {
    await act(async () => {
      mountWorkflowStateWidget({
        containerId: "test-container",
        initialPieceState: validInitialState as any,
        pieceId: "piece-1",
      });
    });

    expect(WorkflowState).toHaveBeenCalled();
    expect(document.querySelector('[data-testid="mock-workflow-state"]')).toBeInTheDocument();
  });

  it("handles stringified initialPieceState", async () => {
    await act(async () => {
      mountWorkflowStateWidget({
        containerId: "test-container",
        initialPieceState: JSON.stringify(validInitialState) as any,
        pieceId: "piece-1",
      });
    });

    // Check last call to ignore StrictMode double-call noise
    // We only check the first argument (props)
    expect(vi.mocked(WorkflowState).mock.lastCall![0]).toEqual(
      expect.objectContaining({
        initialPieceState: expect.objectContaining({
          id: "piece-state-1",
          notes: "Original notes",
        }),
      })
    );
  });

  it("merges global_ref_values into custom_fields", async () => {
    const stateWithRefs = {
      ...validInitialState,
      global_ref_values: {
        clay_body: { id: "cb-1", name: "Speckled Buff" },
      },
    };

    await act(async () => {
      mountWorkflowStateWidget({
        containerId: "test-container",
        initialPieceState: stateWithRefs as any,
        pieceId: "piece-1",
      });
    });

    expect(vi.mocked(WorkflowState).mock.lastCall![0]).toEqual(
      expect.objectContaining({
        initialPieceState: expect.objectContaining({
          custom_fields: {
            clay_weight_lbs: 1.5,
            clay_body: { id: "cb-1", name: "Speckled Buff" },
          },
        }),
      })
    );
  });

  it("provides a cleanup function that unmounts and removes portals", async () => {
    let unmount: () => void = () => {};
    await act(async () => {
      unmount = mountWorkflowStateWidget({
        containerId: "test-container",
        initialPieceState: validInitialState as any,
        pieceId: "piece-1",
      });
    });

    // Check if portal root was created
    const portalRoot = document.getElementById("portal-root-test-container");
    expect(portalRoot).toBeInTheDocument();

    // Call cleanup
    await act(async () => {
      unmount();
    });

    // Verify portal root is gone
    expect(document.getElementById("portal-root-test-container")).not.toBeInTheDocument();
  });

  it("captures changes via onChange and serializes them to the hidden input", async () => {
    // Mock the hidden input that widgets.py creates
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.id = "id_unified_custom_fields";
    document.body.appendChild(hiddenInput);

    await act(async () => {
      mountWorkflowStateWidget({
        containerId: "test-container",
        initialPieceState: validInitialState as any,
        pieceId: "piece-1",
        onChange: (payload) => {
          hiddenInput.value = JSON.stringify(payload);
        }
      });
    });

    // Extract the onChange passed to WorkflowState
    const lastCallProps = vi.mocked(WorkflowState).mock.lastCall![0];
    const mockPayload = { notes: "Updated", custom_fields: { foo: "bar" } };
    
    // Simulate a change
    await act(async () => {
      lastCallProps.onChange!(mockPayload as any);
    });

    expect(hiddenInput.value).toBe(JSON.stringify(mockPayload));
  });
});
