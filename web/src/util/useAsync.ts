import { useCallback, useEffect, useState } from "react";
import type { DependencyList, Dispatch, SetStateAction } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: any | null;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  /**
   * Manually update the resolved data without re-fetching.
   * Accepts a new value or a functional updater, matching the React
   * `setState` signature.
   */
  setData: Dispatch<SetStateAction<T | null>>;
}

interface UseAsyncOptions {
  enabled?: boolean;
}

/**
 * Manages loading / error / data state for an async function.
 *
 * Re-runs whenever `deps` change (defaults to `[]`, i.e. runs once on mount).
 * A cancellation flag prevents stale state updates when deps change or the
 * component unmounts before the previous call resolves.
 *
 * Also exposes `setData` for optimistic / local mutations (e.g. prepending a
 * newly created item without re-fetching the full list).
 *
 * @example
 * const { data: pieces, loading, error, setData: setPieces } = useAsync(fetchPieces)
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: DependencyList = [],
  options: UseAsyncOptions = {},
): UseAsyncResult<T> {
  const { enabled = true } = options;
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    asyncFn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: err,
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const setData = useCallback((updater: SetStateAction<T | null>) => {
    setState((prev) => ({
      ...prev,
      data:
        typeof updater === "function"
          ? (updater as (prev: T | null) => T | null)(prev.data)
          : updater,
    }));
  }, []);

  return { ...state, setData };
}

/**
 * Manages loading / error / data state for a manually-triggered async function.
 * Returns an `execute` function and the current state.
 */
export function useAsyncFn<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  deps: DependencyList = [],
): AsyncState<T> & { execute: (...args: Args) => Promise<T | undefined> } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args) => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await asyncFn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (err: unknown) {
        setState({ data: null, loading: false, error: err });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  return { ...state, execute };
}
