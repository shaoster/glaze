import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type UseAutosaveOptions = {
  dirty: boolean;
  save: () => Promise<void>;
  delayMs?: number;
  mutationKey: unknown[];
};

type UseAutosaveResult = {
  status: AutosaveStatus;
  error: string | null;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
};

const DEFAULT_AUTOSAVE_DELAY_MS = 700;

export function useAutosave({
  dirty,
  save,
  delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
  mutationKey,
}: UseAutosaveOptions): UseAutosaveResult {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const { mutate, mutateAsync, status } = useMutation({
    mutationFn: save,
    mutationKey,
    onSuccess: () => setLastSavedAt(new Date()),
  });

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => mutate(), delayMs);
    return () => window.clearTimeout(timer);
  }, [dirty, delayMs, mutate]);

  const displayStatus: AutosaveStatus =
    dirty && status === "idle"
      ? "pending"
      : status === "pending"
        ? "saving"
        : status === "success"
          ? "saved"
          : status === "error"
            ? "error"
            : lastSavedAt
              ? "saved"
              : "idle";

  const saveNow = useCallback(() => mutateAsync(), [mutateAsync]);

  return {
    status: displayStatus,
    error:
      status === "error"
        ? "Autosave failed. Your changes are still here."
        : null,
    lastSavedAt,
    saveNow,
  };
}
