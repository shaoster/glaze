import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("../api", () => ({
  toggleGlobalEntryFavorite: vi.fn(),
}));

import { toggleGlobalEntryFavorite } from "../api";
import { useToggleGlobalEntryFavorite } from "../useToggleGlobalEntryFavorite";

const mockToggle = vi.mocked(toggleGlobalEntryFavorite);

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useToggleGlobalEntryFavorite", () => {
  it("optimistically flips is_favorite and sets save status to saved", async () => {
    mockToggle.mockResolvedValue(undefined);
    const queryKey = ["entries"];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKey, [
      { id: "entry-1", is_favorite: false },
      { id: "entry-2", is_favorite: true },
    ]);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () => useToggleGlobalEntryFavorite("glaze_combination", queryKey),
      { wrapper },
    );

    expect(result.current.saveStatus).toBe("idle");

    await act(async () => {
      await result.current.toggleFavorite({ id: "entry-1", is_favorite: false });
    });

    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
    expect(mockToggle).toHaveBeenCalledWith("glaze_combination", "entry-1", true);
    expect(result.current.togglingId).toBeNull();
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    expect(result.current.saveError).toBeNull();

    const updated = queryClient.getQueryData<{ id: string; is_favorite: boolean }[]>(queryKey);
    expect(updated?.find((e) => e.id === "entry-1")?.is_favorite).toBe(true);
    expect(updated?.find((e) => e.id === "entry-2")?.is_favorite).toBe(true);
  });

  it("sets saveStatus to error and records the message when the API call fails", async () => {
    mockToggle.mockRejectedValue(new Error("network error"));
    const queryKey = ["entries"];
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => useToggleGlobalEntryFavorite("glaze_combination", queryKey),
      { wrapper },
    );

    await act(async () => {
      await result.current.toggleFavorite({ id: "entry-2", is_favorite: true });
    });

    await waitFor(() => expect(result.current.saveStatus).toBe("error"));
    expect(result.current.saveError).toBe(
      "Failed to update favorite. Please try again.",
    );
    expect(result.current.togglingId).toBeNull();
  });
});
