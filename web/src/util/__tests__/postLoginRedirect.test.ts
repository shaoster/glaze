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

  it("redirects to admin subdomain when next targets admin.<apex>", () => {
    expect(
      getPostLoginRedirectTarget(
        HOST,
        PROTO,
        "https://admin.potterdoc.com/dashboard",
      ),
    ).toBe("https://admin.potterdoc.com/dashboard");
  });

  it("strips www. prefix when checking admin subdomain eligibility", () => {
    expect(
      getPostLoginRedirectTarget(
        "www.potterdoc.com",
        PROTO,
        "https://admin.potterdoc.com/dashboard",
      ),
    ).toBe("https://admin.potterdoc.com/dashboard");
  });

  it("returns null when current host is already admin.", () => {
    expect(
      getPostLoginRedirectTarget(
        "admin.potterdoc.com",
        PROTO,
        "/pieces/abc/showcase",
      ),
    ).toBeNull();
  });
});
