import { GraphQLClient, type Variables } from "graphql-request";

import { getAccessToken } from "./authTokenStore";

// Mirror the axios client's base-URL resolution (src/util/api.ts): the GraphQL
// endpoint lives under the same /api/ prefix, overridable for Expo/mobile.
const expoBaseUrl = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.EXPO_PUBLIC_API_BASE_URL;
const GRAPHQL_ENDPOINT = `${expoBaseUrl ?? "/api/"}graphql/`;

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

/**
 * Issue a GraphQL request with the same auth posture as the REST client:
 * a session cookie (with the matching CSRF header) and/or a Bearer token.
 */
export async function graphqlRequest<T>(
  document: string,
  variables?: Variables,
): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = readCookie("potterdoc_csrftoken");
  if (csrf) headers["X-CSRFToken"] = csrf;
  const accessToken = getAccessToken();
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  return graphqlClient.request<T>(document, variables, headers);
}
