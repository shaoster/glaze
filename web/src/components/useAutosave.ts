import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type UseAutosaveOptions = {
  dirty: boolean;
  saveKey: string;
  save: () => Promise<void>;
  delayMs?: number;
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
  saveKey,
  save,
  delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
}: UseAutosaveOptions): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const saveRef = useRef(save);
  const runIdRef = useRef(0);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const saveNow = useCallback(async () => {
    if (!dirty) {
      setError(null);
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setStatus("saving");
    setError(null);
    try {
      await saveRef.current();
      if (runIdRef.current !== runId) return;
      setLastSavedKey(saveKey);
      setFailedKey(null);
      setLastSavedAt(new Date());
      setStatus("saved");
    } catch {
      if (runIdRef.current !== runId) return;
      setFailedKey(saveKey);
      setStatus("error");
      setError("Autosave failed. Your changes are still here.");
    }
  }, [dirty, saveKey]);

  useEffect(() => {
    if (!dirty) return;

    const timeoutId = window.setTimeout(() => {
      void saveNow();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, dirty, saveNow]);

  let displayStatus: AutosaveStatus = lastSavedAt ? "saved" : "idle";
  if (dirty) {
    if (status === "saving") {
      displayStatus = "saving";
    } else if (failedKey === saveKey) {
      displayStatus = "error";
    } else if (lastSavedKey === saveKey) {
      displayStatus = "saved";
    } else {
      displayStatus = "pending";
    }
  }

  return { status: displayStatus, error, lastSavedAt, saveNow };
}
