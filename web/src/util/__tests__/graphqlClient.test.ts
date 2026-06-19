import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ClientError } from "graphql-request";

import { graphqlClient } from "../graphqlClient";

describe("graphqlClient", () => {
  it("uses an absolute endpoint URL", () => {
    // Regression: graphql-request calls `new URL(endpoint)` internally, which
    // throws on a relative path in the browser ("Failed to construct 'URL'").
    // The endpoint must be absolute or the piece list silently fails to load.
    expect(graphqlClient.url).toMatch(/^https?:\/\//);
    expect(graphqlClient.url).toMatch(/\/api\/graphql\/$/);
    // Sanity: `new URL` must accept it without a base.
    expect(() => new URL(graphqlClient.url)).not.toThrow();
  });

  it("derives the endpoint from the Expo base URL env var when present", async () => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com/";
    const { graphqlClient: expoClient } = await import("../graphqlClient");
    expect(expoClient.url).toBe("https://api.example.com/graphql/");
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    vi.resetModules();
  });

  it("appends trailing slash to Expo base URL when missing", async () => {
    vi.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    const { graphqlClient: expoClient } = await import("../graphqlClient");
    expect(expoClient.url).toBe("https://api.example.com/graphql/");
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    vi.resetModules();
  });

  it("derives the endpoint from window.location.origin when no Expo env var is set", async () => {
    vi.resetModules();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });
    const { graphqlClient: windowClient } = await import("../graphqlClient");
    expect(windowClient.url).toBe("https://app.example.com/api/graphql/");
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe("graphqlRequest", () => {
  it("returns data on a successful request", async () => {
    vi.resetModules();
    const { graphqlClient: client, graphqlRequest } =
      await import("../graphqlClient");
    const mockReq = vi.fn().mockResolvedValueOnce({ pieces: [] });
    vi.spyOn(client, "request").mockImplementation(mockReq);

    const result = await graphqlRequest<{ pieces: unknown[] }>("query { }");

    expect(result).toEqual({ pieces: [] });
    vi.restoreAllMocks();
  });

  it("rethrows non-auth errors without refresh", async () => {
    vi.resetModules();
    const { graphqlClient: client, graphqlRequest } =
      await import("../graphqlClient");
    const networkError = new Error("network failure");
    const mockReq = vi.fn().mockRejectedValueOnce(networkError);
    vi.spyOn(client, "request").mockImplementation(mockReq);

    await expect(graphqlRequest("query { }")).rejects.toThrow("network failure");
    expect(mockReq).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("clears the access token and rethrows when refresh fails", async () => {
    vi.resetModules();
    const { setAccessToken, getAccessToken } = await import("../authTokenStore");
    setAccessToken("expired-token");

    const { graphqlClient: client, graphqlRequest } =
      await import("../graphqlClient");
    const authError = new ClientError(
      { errors: [{ message: "not authenticated" }], status: 401 } as never,
      { query: "query { }" },
    );
    const mockReq = vi.fn().mockRejectedValue(authError);
    vi.spyOn(client, "request").mockImplementation(mockReq);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(graphqlRequest("query { }")).rejects.toBeDefined();
    expect(getAccessToken()).toBeNull();

    setAccessToken(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("refreshes the token and retries when an auth error is returned", async () => {
    vi.resetModules();
    const { setAccessToken } = await import("../authTokenStore");
    setAccessToken("expired-token");

    const { graphqlClient: client, graphqlRequest } =
      await import("../graphqlClient");
    const authError = new ClientError(
      { errors: [{ message: "not authenticated" }], status: 401 } as never,
      { query: "query { }" },
    );
    const mockReq = vi
      .fn()
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({ pieces: [] });
    vi.spyOn(client, "request").mockImplementation(mockReq);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ accessToken: "fresh-token" }),
        }),
    );

    const result = await graphqlRequest<{ pieces: unknown[] }>("query { }");

    expect(result).toEqual({ pieces: [] });
    expect(mockReq).toHaveBeenCalledTimes(2);

    setAccessToken(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
