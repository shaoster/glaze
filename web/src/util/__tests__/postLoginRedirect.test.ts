import { describe, it, expect } from "vitest";
import { getPostLoginRedirectTarget } from "../postLoginRedirect";

const HOST = "potterdoc.com";
const PROTO = "https:";

describe("getPostLoginRedirectTarget", () => {
  it("returns null when next is null", () => {
    expect(getPostLoginRedirectTarget(HOST, PROTO, null)).toBeNull();
  });

  it("returns null for an external domain", () => {
    expect(
      getPostLoginRedirectTarget(HOST, PROTO, "https://evil.com/steal"),
    ).toBeNull();
  });

  it("returns null for a path that does not start with /pieces/", () => {
    expect(
      getPostLoginRedirectTarget(HOST, PROTO, "/admin-fake/path"),
    ).toBeNull();
  });

  it("returns the full URL for a /pieces/* same-origin redirect", () => {
    expect(
      getPostLoginRedirectTarget(HOST, PROTO, "/pieces/abc/showcase"),
    ).toBe("https://potterdoc.com/pieces/abc/showcase");
  });

  it("returns null for localhost hostname", () => {
    expect(
      getPostLoginRedirectTarget("localhost", PROTO, "/pieces/abc/showcase"),
    ).toBeNull();
  });
});
