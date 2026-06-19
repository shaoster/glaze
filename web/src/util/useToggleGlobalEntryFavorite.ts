import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toggleGlobalEntryFavorite } from "./api";
import type { AutosaveStatus } from "../components/useAutosave";

interface FavorableEntry {
  id: string;
  is_favorite?: boolean;
  [key: string]: unknown;
}

export function useToggleGlobalEntryFavorite(
  globalName: string,
  entriesQueryKey: QueryKey,
): {
  toggleFavorite: (entry: FavorableEntry) => Promise<void>;
  togglingId: string | null;
  saveStatus: AutosaveStatus;
  saveError: string | null;
  lastSavedAt: Date | null;
} {
  const queryClient = useQueryClient();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  async function toggleFavorite(entry: FavorableEntry): Promise<void> {
    setTogglingId(entry.id);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await toggleGlobalEntryFavorite(globalName, entry.id, !entry.is_favorite);
      queryClient.setQueryData(
        entriesQueryKey,
        (prev: FavorableEntry[] | undefined) =>
          (prev ?? []).map((candidate) =>
            candidate.id === entry.id
              ? { ...candidate, is_favorite: !candidate.is_favorite }
              : candidate,
          ),
      );
      setLastSavedAt(new Date());
      setSaveStatus("saved");
    } catch {
      setSaveError("Failed to update favorite. Please try again.");
      setSaveStatus("error");
    } finally {
      setTogglingId(null);
    }
  }

  return { toggleFavorite, togglingId, saveStatus, saveError, lastSavedAt };
}
