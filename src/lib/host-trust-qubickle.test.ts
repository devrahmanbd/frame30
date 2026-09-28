/**
 * QUBICKLE host-trust RED-first (Rules 2/5/28/22).
 *
 * - edge-hosts framique.test must be dot-anchored (evilframique.test denied)
 * - preview-deploy / editor-preview must be platform-suffix-anchored
 *   (preview.evil.com denied, preview.framique.store allowed)
 * - preview edge null-host must fail closed (blocked)
 * - preview host variants: case / port / trailing-dot
 * - XFH spoof: effective host requires host+XFH agreement
 */
import { describe, expect, it } from "vitest";
import { isLocalHostname, isPreviewDeployHost } from "./edge-hosts";
import {
  isBlockedThemePreview,
  isThemePreviewHostAllowed,
  resolveEffectiveHost,
} from "./storefront-host.server";

describe("Rule 5 — framique.test dot-anchored", () => {
  it("rejects evilframique.test", () => {
    expect(isLocalHostname("evilframique.test")).toBe(false);
  });
  it("accepts genuine framique.test + subdomains", () => {
    expect(isLocalHostname("framique.test")).toBe(true);
    expect(isLocalHostname("shop.framique.test")).toBe(true);
  });
});

describe("Rule 5 — preview-deploy platform-anchored", () => {
  it("rejects preview.evil.com", () => {
    expect(isPreviewDeployHost("preview.evil.com")).toBe(false);
  });
  it("allows preview on platform suffix", () => {
    expect(isPreviewDeployHost("preview.framique.store")).toBe(true);
    expect(isPreviewDeployHost("id-preview--abc.framique.store")).toBe(true);
  });
  it("rejects id-preview-- on attacker suffix", () => {
    expect(isPreviewDeployHost("id-preview--abc.evil.com")).toBe(false);
  });
});

describe("Rule 5/28 — preview null-host fail closed", () => {
  it("blocks null/empty host at the edge", () => {
    expect(isBlockedThemePreview(null, "/theme-preview/x")).toBe(true);
    expect(isBlockedThemePreview(undefined, "/theme-preview/x")).toBe(true);
    expect(isBlockedThemePreview("", "/theme-preview/x")).toBe(true);
  });
});

describe("Rule 22 — preview host variants", () => {
  it("matches case-insensitively", () => {
    expect(isThemePreviewHostAllowed("FRAMIQUE.QUBICKLE.COM")).toBe(true);
  });
  it("strips port", () => {
    expect(isThemePreviewHostAllowed("framique.qubickle.com:443")).toBe(true);
  });
  it("strips trailing dot", () => {
    expect(isThemePreviewHostAllowed("framique.qubickle.com.")).toBe(true);
  });
  it("allows localhost variants end-to-end (raw → blocked=false)", () => {
    expect(isBlockedThemePreview("localhost", "/theme-preview/x")).toBe(false);
    expect(isBlockedThemePreview("localhost:3000", "/theme-preview/x")).toBe(
      false,
    );
    expect(isBlockedThemePreview("LOCALHOST", "/theme-preview/x")).toBe(false);
  });
});

describe("Rule 2 — XFH spoof rejected", () => {
  it("ignores XFH when it disagrees with Host (uses Host)", () => {
    // Attacker on merchant host spoofs XFH to system domain.
    expect(
      resolveEffectiveHost({
        host: "flamelancer.com",
        xForwardedHost: "framique.qubickle.com",
        urlHost: "flamelancer.com",
      }),
    ).toBe("flamelancer.com");
  });
  it("honors XFH when it agrees with Host", () => {
    expect(
      resolveEffectiveHost({
        host: "microscrop.shop",
        xForwardedHost: "microscrop.shop",
        urlHost: "microscrop.shop",
      }),
    ).toBe("microscrop.shop");
  });
  it("falls back to Host when XFH missing", () => {
    expect(
      resolveEffectiveHost({
        host: "flamelancer.com",
        xForwardedHost: null,
        urlHost: "flamelancer.com",
      }),
    ).toBe("flamelancer.com");
  });
});
