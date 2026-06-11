import { describe, expect, it } from "vitest";

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
});
