/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AuthUser, UserPreferences } from "../util/api";

export type PreferencesSectionId = "process-summary" | "tutorials";

const CurrentUserContext = createContext<AuthUser | null>(null);

export function CurrentUserProvider({
  currentUser,
  children,
}: {
  currentUser: AuthUser | null;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={currentUser}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): AuthUser | null {
  return useContext(CurrentUserContext);
}

type SaveUserPreferences = (preferences: UserPreferences) => Promise<UserPreferences>;

const PreferencesActionsContext = createContext<{
  openPreferencesDialog: (sectionId?: PreferencesSectionId | null) => void;
  saveUserPreferences: SaveUserPreferences;
} | null>(null);

export function PreferencesDialogProvider({
  openPreferencesDialog,
  saveUserPreferences,
  children,
}: {
  openPreferencesDialog: (sectionId?: PreferencesSectionId | null) => void;
  saveUserPreferences: SaveUserPreferences;
  children: ReactNode;
}) {
  return (
    <PreferencesActionsContext.Provider
      value={{ openPreferencesDialog, saveUserPreferences }}
    >
      {children}
    </PreferencesActionsContext.Provider>
  );
}

export function useOpenPreferencesDialog():
  | ((sectionId?: PreferencesSectionId | null) => void)
  | null {
  return useContext(PreferencesActionsContext)?.openPreferencesDialog ?? null;
}

export function useSaveUserPreferences(): SaveUserPreferences | null {
  return useContext(PreferencesActionsContext)?.saveUserPreferences ?? null;
}
