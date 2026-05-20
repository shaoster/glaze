/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AuthUser } from "../util/api";

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
