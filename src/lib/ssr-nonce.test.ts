import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getRequest: vi.fn() }));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: h.getRequest,
}));

import {
  currentNonce,
  resetClientNonceCache,
  setCurrentNonce,
} from "./ssr-nonce";

describe("currentNonce — per-request CSP nonce (2026-10-26 hydration race)", () => {
  afterEach(() => {
    h.getRequest.mockReset();
    setCurrentNonce("");
    resetClientNonceCache();
  });

  it("uses THIS request's nonce even when a concurrent document left another in the store", () => {
    setCurrentNonce("nonce-of-a-concurrent-document");
    h.getRequest.mockReturnValue(
      new Request("http://localhost/store/frame19-demo/cart", {
        headers: { "x-csp-nonce": "this-documents-nonce" },
      }),
    );
    expect(currentNonce()).toBe("this-documents-nonce");
  });

  it("falls back to the module store outside a request context (unit tests, prerender)", () => {
    setCurrentNonce("fallback-nonce");
    h.getRequest.mockImplementation(() => {
      throw new Error("no request context");
    });
    expect(currentNonce()).toBe("fallback-nonce");
  });

  it("returns undefined when no request and no store value exist", () => {
    setCurrentNonce("");
    h.getRequest.mockImplementation(() => {
      throw new Error("no request context");
    });
    expect(currentNonce()).toBeUndefined();
  });

  it("ignores an empty request header and falls through to the store", () => {
    setCurrentNonce("fallback-nonce");
    h.getRequest.mockReturnValue(
      new Request("http://localhost/", {
        headers: { "x-csp-nonce": "   " },
      }),
    );
    expect(currentNonce()).toBe("fallback-nonce");
  });
});
