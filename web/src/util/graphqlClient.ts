import { ClientError, GraphQLClient, type Variables } from "graphql-request";

import { clearAccessToken, getAccessToken, setAccessToken } from "./authTokenStore";

// The GraphQL endpoint lives under the same /api/ prefix as the REST API,
// overridable for Expo/mobile. Unlike axios (which resolves relative URLs
// against the document origin), graphql-request calls `new URL(endpoint)`
// internally and throws on a relative path — so the endpoint must be ABSOLUTE.
// Derive the origin from window when available; the Expo override is already
// absolute (normalize its trailing slash).
const expoBaseUrl = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.EXPO_PUBLIC_API_BASE_URL;

function resolveApiBase(): string {
  if (expoBaseUrl) {
    return expoBaseUrl.endsWith("/") ? expoBaseUrl : `${expoBaseUrl}/`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/`;
  }
  return "/api/";
}

const API_BASE = resolveApiBase();
const GRAPHQL_ENDPOINT = `${API_BASE}graphql/`;

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  credentials: "include",
});

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const csrf = readCookie("potterdoc_csrftoken");
  if (csrf) headers["X-CSRFToken"] = csrf;
  const accessToken = getAccessToken();
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

// Bearer-token refresh for the GraphQL path. The axios client in api.ts has its
// own (axios-interceptor) refresh; this fetch-based mirror keeps the GraphQL
// transport self-contained without importing the axios client (which would
// create an import cycle, since api.ts imports this module).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      // Ensure the CSRF cookie exists, then post to the refresh endpoint with
      // the session cookie (credentials: include).
      await fetch(`${API_BASE}auth/csrf/`, { credentials: "include" });
      const csrf = readCookie("potterdoc_csrftoken");
      const response = await fetch(`${API_BASE}auth/token/refresh/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRFToken": csrf } : {}),
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(`token refresh failed: ${response.status}`);
      const data = (await response.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return data.accessToken;
    })()
      .catch(() => {
        clearAccessToken();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof ClientError)) return false;
  const errors = error.response?.errors ?? [];
  return errors.some((e) =>
    /authentication|credentials|not authenticated/i.test(e.message ?? ""),
  );
}

/**
 * Issue a GraphQL request with the same auth posture as the REST client (a
 * session cookie with CSRF header, and/or a Bearer token). On an authentication
 * error from an expired Bearer token, refresh the token once and retry — the
 * parity of api.ts's 401 interceptor for the GraphQL transport.
 */
export async function graphqlRequest<T>(
  document: string,
  variables?: Variables,
): Promise<T> {
  try {
    return await graphqlClient.request<T>(document, variables, authHeaders());
  } catch (error) {
    if (!isAuthError(error) || !getAccessToken()) throw error;
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw error;
    return graphqlClient.request<T>(document, variables, authHeaders());
  }
}
