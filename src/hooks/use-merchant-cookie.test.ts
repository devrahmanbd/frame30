/**
 * Active-merchant hint dual-write (origin-split §3 step 4, backward-compatible
 * subset only).
 *
 * HARD RULE: never invalidate existing sessions. The legacy cookie name and
 * read path stay honored, so every assertion here pins both halves:
 *  - legacy entry keeps its exact pre-split attributes on http dev
 *    (+ `Secure` only on https — parity, never weaken local dev);
 *  - the `__Host-` successor is `Secure` + `Path=/` + host-only (no Domain=),
 *    required for the prefix to stick;
 *  - both carry `SameSite=Lax` for the top-level-navigated flows.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVE_MERCHANT_COOKIE,
  buildMerchantCookieStrings,
  HOST_ACTIVE_MERCHANT_COOKIE,
} from "./use-merchant";

const MID = "b0ba0000-0000-4000-8000-000000000001";

describe("buildMerchantCookieStrings", () => {
  it("keeps the legacy entry byte-identical on http (old sessions untouched)", () => {
    const [legacy] = buildMerchantCookieStrings(MID, "http:");
    expect(legacy).toBe(
      `${ACTIVE_MERCHANT_COOKIE}=${MID}; path=/; max-age=31536000; SameSite=Lax`,
    );
  });

  it("adds Secure to the legacy entry only on https", () => {
    const [legacy] = buildMerchantCookieStrings(MID, "https:");
    expect(legacy).toContain("SameSite=Lax");
    expect(legacy).toContain("Secure");
    expect(legacy).not.toContain("Domain=");
  });

  it("emits a __Host- successor that satisfies the prefix requirements", () => {
    const [, next] = buildMerchantCookieStrings(MID, "https:");
    expect(HOST_ACTIVE_MERCHANT_COOKIE.startsWith("__Host-")).toBe(true);
    expect(next).toContain(`${HOST_ACTIVE_MERCHANT_COOKIE}=${MID}`);
    expect(next).toContain("Path=/");
    expect(next).toContain("SameSite=Lax");
    expect(next).toContain("Secure");
    expect(next).not.toContain("Domain=");
  });

  it("still emits the __Host- entry with Secure on http (browser ignores it; legacy covers)", () => {
    const [legacy, next] = buildMerchantCookieStrings(MID, "http:");
    expect(next).toContain("Secure");
    expect(legacy).not.toContain("Secure");
  });

  it("carries the same merchant id in both entries", () => {
    const [legacy, next] = buildMerchantCookieStrings(MID, "https:");
    expect(legacy).toContain(MID);
    expect(next).toContain(MID);
  });
});
