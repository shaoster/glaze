/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getAccessToken,
  subscribeAccessToken,
} from "../util/authTokenStore";

const AuthTokenContext = createContext<string | null>(null);

export function AuthTokenProvider({ children }: { children: ReactNode }) {
  const accessToken = useSyncExternalStore(
    subscribeAccessToken,
    getAccessToken,
    getAccessToken,
  );

  return (
    <AuthTokenContext.Provider value={accessToken}>
      {children}
    </AuthTokenContext.Provider>
  );
}

export function useAuthToken(): string | null {
  return useContext(AuthTokenContext);
}
