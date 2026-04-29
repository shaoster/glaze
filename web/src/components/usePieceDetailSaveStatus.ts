import { createContext, useContext } from "react";
import type { AutosaveStatus as AutosaveStatusValue } from "./useAutosave";

export type SaveStatusSnapshot = {
  status: AutosaveStatusValue;
  error: string | null;
  lastSavedAt: Date | null;
};

export type PieceDetailSaveStatusContextValue = {
  publishWorkflowStatus: (snapshot: SaveStatusSnapshot) => void;
  runManualSave: <T>(save: () => Promise<T>) => Promise<T>;
};

export const PieceDetailSaveStatusContext =
  createContext<PieceDetailSaveStatusContextValue | null>(null);

export function usePieceDetailSaveStatus() {
  return useContext(PieceDetailSaveStatusContext);
}
