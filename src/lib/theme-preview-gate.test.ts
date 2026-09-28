/**
 * SECURITY: theme preview is system-domain-only (TDD RED-first).
 *
 * Owner-ordered end state: `/theme-preview/<key>` must render ONLY on the
 * system domain (framique.qubickle.com + local dev hosts). Today the route
 * has no loader and no host check, so mapped merchant hosts (e.g.
 * flamelancer.com) SSR it publicly — live proof: identical 200/160243B on
 * both hosts. The gate below fails closed to bare 404 (never a login
 * redirect from storefront paths).
 */
import { describe, expect, it } from "vitest";
import {
  isBlockedThemePreview,
  isThemePreviewHostAllowed,
} from "./storefront-host.server";
import { resolveThemePreview } from "./theme-preview-nav";

describe("isThemePreviewHostAllowed", () => {
  it("denies merchant/custom hosts", () => {
    expect(isThemePreviewHostAllowed("flamelancer.com")).toBe(false);
    expect(isThemePreviewHostAllowed("microscrop.shop")).toBe(false);
    expect(isThemePreviewHostAllowed("shop.example.com.bd")).toBe(false);
  });

  it("denies empty/unknown hosts (fail closed)", () => {
    expect(isThemePreviewHostAllowed(null)).toBe(false);
    expect(isThemePreviewHostAllowed(undefined)).toBe(false);
    expect(isThemePreviewHostAllowed("")).toBe(false);
  });

  it("allows the system domain and platform hosts", () => {
    expect(isThemePreviewHostAllowed("framique.qubickle.com")).toBe(true);
    expect(isThemePreviewHostAllowed("edge.framique.store")).toBe(true);
  });

  it("allows local dev hosts", () => {
    expect(isThemePreviewHostAllowed("localhost")).toBe(true);
    expect(isThemePreviewHostAllowed("127.0.0.1")).toBe(true);
  });
});

describe("isBlockedThemePreview", () => {
  it("denies guest preview on a merchant host (the reported hole)", () => {
    expect(
      isBlockedThemePreview("flamelancer.com", "/theme-preview/somvabona"),
    ).toBe(true);
    expect(
      isBlockedThemePreview("microscrop.shop", "/theme-preview/songoskriti"),
    ).toBe(true);
  });

  it("denies preview with query strings on merchant hosts", () => {
    expect(
      isBlockedThemePreview(
        "flamelancer.com",
        "/theme-preview/somvabona?template=product",
      ),
    ).toBe(true);
  });

  it("allows preview on the system domain", () => {
    expect(
      isBlockedThemePreview(
        "framique.qubickle.com",
        "/theme-preview/somvabona",
      ),
    ).toBe(false);
  });

  it("allows preview on local dev hosts", () => {
    expect(
      isBlockedThemePreview("localhost", "/theme-preview/songoskriti"),
    ).toBe(false);
    expect(
      isBlockedThemePreview("127.0.0.1:3000", "/theme-preview/songoskriti"),
    ).toBe(false);
  });

  it("leaves every non-preview path untouched (legit flows keep working)", () => {
    // Signed split-preview flow (system domain) + custom-host storefront.
    expect(
      isBlockedThemePreview(
        "framique.qubickle.com",
        "/store/flame-fashion-bd?preview_token=abc",
      ),
    ).toBe(false);
    expect(isBlockedThemePreview("flamelancer.com", "/")).toBe(false);
    expect(isBlockedThemePreview("flamelancer.com", "/p/shirt")).toBe(false);
    expect(isBlockedThemePreview("framique.qubickle.com", "/")).toBe(false);
    expect(
      isBlockedThemePreview("framique.qubickle.com", "/dashboard/builder"),
    ).toBe(false);
  });

  it("blocks null hosts at the edge (Rule 5 fail closed — never serves blueprints without a host)", () => {
    expect(isBlockedThemePreview(null, "/theme-preview/x")).toBe(true);
    expect(isBlockedThemePreview(undefined, "/theme-preview/x")).toBe(true);
    expect(isBlockedThemePreview("", "/theme-preview/x")).toBe(true);
    // Non-preview paths still pass through (no host-gating outside previews).
    expect(isBlockedThemePreview(null, "/store/x")).toBe(false);
  });
});

describe("preview key resolution (forged/random keys)", () => {
  it("resolves no preset for a forged/random key (route 404s)", () => {
    expect(resolveThemePreview("no-such-theme-xyz")).toBeNull();
  });
});
