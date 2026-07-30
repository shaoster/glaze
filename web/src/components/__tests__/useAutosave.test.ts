import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useAutosave } from "../useAutosave";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAutosave", () => {
  it("schedules a fresh save for edits made while the previous save is still in flight", async () => {
    const wrapper = makeWrapper();

    let resolveFirstSave: () => void = () => {};
    const firstSavePromise = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const save1 = () => firstSavePromise;
    const save2 = async () => {};
    let save2CallCount = 0;
    const trackedSave2 = async () => {
      save2CallCount += 1;
      await save2();
    };

    const { result, rerender } = renderHook(
      ({ save }: { save: () => Promise<void> }) =>
        useAutosave({
          dirty: true,
          save,
          delayMs: 10,
          mutationKey: ["test-autosave"],
        }),
      { wrapper, initialProps: { save: save1 } },
    );

    // The initial debounce window elapses and the first save fires.
    await waitFor(() => expect(result.current.status).toBe("saving"));

    // While that save is still in flight, the user keeps typing. `dirty`
    // stays true throughout (base state hasn't caught up yet), but the
    // save callback closes over the newer content — exactly like
    // WorkflowState/PieceHistory rebuilding `save` via useCallback on
    // every keystroke.
    rerender({ save: trackedSave2 });

    // The in-flight save finally completes.
    resolveFirstSave();
    await waitFor(() => expect(result.current.lastSavedAt).not.toBeNull());

    // A fresh debounce window must be scheduled for the edit that arrived
    // during the first save — otherwise it is silently dropped.
    await waitFor(() => expect(save2CallCount).toBe(1));
  });
});
