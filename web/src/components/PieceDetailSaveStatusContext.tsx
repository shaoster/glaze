import { useMutationState } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AutosaveStatus from "./AutosaveStatus";
import {
  PieceDetailSaveStatusContext,
  type SaveStatusSnapshot,
} from "./usePieceDetailSaveStatus";

const RESET_DELAY_MS = 1800;

const defaultSnapshot: SaveStatusSnapshot = {
  status: "idle",
  error: null,
  lastSavedAt: null,
};

function useResetTimer() {
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const scheduleReset = useCallback(
    (callback: () => void) => {
      clearResetTimer();
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        callback();
      }, RESET_DELAY_MS);
    },
    [clearResetTimer],
  );

  useEffect(() => clearResetTimer, [clearResetTimer]);

  return { clearResetTimer, scheduleReset };
}

export function PieceDetailSaveStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [manualStatus, setManualStatus] =
    useState<SaveStatusSnapshot>(defaultSnapshot);
  const manualRunIdRef = useRef(0);
  const { clearResetTimer, scheduleReset } = useResetTimer();

  // Derive workflow save status from the TanStack mutation cache so WorkflowState
  // doesn't need to push status through a separate context channel.
  const autosaveMutationStates = useMutationState({
    filters: { mutationKey: ["autosave"] },
    select: (m) => ({
      status: m.state.status,
      error: m.state.error,
      submittedAt: m.state.submittedAt,
    }),
  });
  const latest = autosaveMutationStates.at(-1);
  const workflowStatus: SaveStatusSnapshot = latest
    ? {
        status:
          latest.status === "pending"
            ? "saving"
            : latest.status === "success"
              ? "saved"
              : latest.status === "error"
                ? "error"
                : "idle",
        error:
          latest.status === "error"
            ? "Autosave failed. Your changes are still here."
            : null,
        lastSavedAt:
          latest.status === "success" && latest.submittedAt
            ? new Date(latest.submittedAt)
            : null,
      }
    : defaultSnapshot;

  const runManualSave = useCallback(
    async <T,>(save: () => Promise<T>) => {
      manualRunIdRef.current += 1;
      const runId = manualRunIdRef.current;
      clearResetTimer();
      setManualStatus({
        status: "pending",
        error: null,
        lastSavedAt: null,
      });

      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (manualRunIdRef.current !== runId) {
        return save();
      }

      setManualStatus({
        status: "saving",
        error: null,
        lastSavedAt: null,
      });

      try {
        const result = await save();
        if (manualRunIdRef.current !== runId) {
          return result;
        }
        const lastSavedAt = new Date();
        setManualStatus({
          status: "saved",
          error: null,
          lastSavedAt,
        });
        scheduleReset(() => {
          setManualStatus(defaultSnapshot);
        });
        return result;
      } catch (error) {
        if (manualRunIdRef.current === runId) {
          setManualStatus({
            status: "error",
            error: "Save failed. Please try again.",
            lastSavedAt: null,
          });
        }
        throw error;
      }
    },
    [clearResetTimer, scheduleReset],
  );

  const visibleStatus =
    manualStatus.status === "idle" ? workflowStatus : manualStatus;

  const value = useMemo(
    () => ({
      runManualSave,
    }),
    [runManualSave],
  );

  return (
    <PieceDetailSaveStatusContext.Provider value={value}>
      {children}
      <AutosaveStatus
        status={visibleStatus.status}
        error={visibleStatus.error}
        lastSavedAt={visibleStatus.lastSavedAt}
        variant="floating"
      />
    </PieceDetailSaveStatusContext.Provider>
  );
}
