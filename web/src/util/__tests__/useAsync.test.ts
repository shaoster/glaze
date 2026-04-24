import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAsync } from "../useAsync";

describe("useAsync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("initial state", () => {
    it("starts with loading=true and data=null", () => {
      const asyncFn = vi.fn(() => new Promise<string>(() => {})); // never resolves
      const { result } = renderHook(() => useAsync(asyncFn));
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("stays idle when disabled", () => {
      const asyncFn = vi.fn(() => Promise.resolve("hello"));
      const { result } = renderHook(() =>
        useAsync(asyncFn, [], { enabled: false }),
      );

      expect(asyncFn).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("successful fetch", () => {
    it("resolves data and clears loading", async () => {
      const asyncFn = vi.fn(() => Promise.resolve("hello"));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toBe("hello");
      expect(result.current.error).toBeNull();
    });

    it("calls asyncFn exactly once on mount with default deps", async () => {
      const asyncFn = vi.fn(() => Promise.resolve(42));
      renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(asyncFn).toHaveBeenCalledTimes(1));
    });
  });

  describe("failed fetch", () => {
    it("sets error and clears loading when asyncFn rejects", async () => {
      const asyncFn = vi.fn(() => Promise.reject(new Error("Network error")));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Network error");
    });

    it("wraps non-Error rejections in an Error object", async () => {
      const asyncFn = vi.fn(() => Promise.reject("plain string rejection"));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("plain string rejection");
    });
  });

  describe("deps-based re-fetching", () => {
    it("re-runs asyncFn when deps change", async () => {
      let id = "a";
      const asyncFn = vi.fn((currentId: string) => Promise.resolve(currentId));
      const { result, rerender } = renderHook(() =>
        useAsync(() => asyncFn(id), [id]),
      );

      await waitFor(() => expect(result.current.data).toBe("a"));
      expect(asyncFn).toHaveBeenCalledTimes(1);

      id = "b";
      rerender();

      await waitFor(() => expect(result.current.data).toBe("b"));
      expect(asyncFn).toHaveBeenCalledTimes(2);
    });

    it("resets to loading=true and data=null while re-fetching", async () => {
      let id = "a";
      let resolve!: (v: string) => void;
      const asyncFn = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      );
      const { result, rerender } = renderHook(() => useAsync(asyncFn, [id]));

      // Resolve the first call
      act(() => resolve("a"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Trigger re-fetch — loading should reset
      id = "b";
      rerender();

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  describe("cancellation", () => {
    it("ignores a stale response after deps change", async () => {
      let callCount = 0;
      const resolvers: Array<(v: string) => void> = [];

      const asyncFn = vi.fn(() => {
        callCount++;
        return new Promise<string>((r) => resolvers.push(r));
      });

      let id = "a";
      const { result, rerender } = renderHook(() => useAsync(asyncFn, [id]));

      // Change deps before the first call resolves
      id = "b";
      rerender();

      // Resolve stale call with 'stale', current call with 'fresh'
      act(() => {
        resolvers[0]("stale");
        resolvers[1]("fresh");
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(callCount).toBe(2);
      expect(result.current.data).toBe("fresh");
    });
  });

  describe("setData", () => {
    it("allows direct data mutation without re-fetching", async () => {
      const asyncFn = vi.fn(() => Promise.resolve(["a", "b"]));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.data).toEqual(["a", "b"]));

      act(() => result.current.setData(["a", "b", "c"]));

      expect(result.current.data).toEqual(["a", "b", "c"]);
      expect(asyncFn).toHaveBeenCalledTimes(1); // no re-fetch
    });

    it("supports functional updates via setData", async () => {
      const asyncFn = vi.fn(() => Promise.resolve([1, 2, 3]));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));

      act(() => result.current.setData((prev) => [0, ...(prev ?? [])]));

      expect(result.current.data).toEqual([0, 1, 2, 3]);
    });

    it("allows setting data to null", async () => {
      const asyncFn = vi.fn(() => Promise.resolve("value"));
      const { result } = renderHook(() => useAsync(asyncFn));

      await waitFor(() => expect(result.current.data).toBe("value"));

      act(() => result.current.setData(null));

      expect(result.current.data).toBeNull();
    });
  });
});
