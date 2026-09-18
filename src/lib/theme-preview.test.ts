/**
 * Signed storefront preview tokens (TDD): unforgeable, short-lived bearer
 * capability so the preview iframe needs no session. Shoppers without a
 * token always see the published theme; drafts never leak.
 */
import { describe, expect, it } from "vitest";
import { issuePreviewToken, verifyPreviewToken } from "./theme-preview.server";

const SECRET = "test-secret-please-ignore";
const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const NOW = 1_700_000_000_000;

describe("preview tokens", () => {
  it("round-trips a token issued seconds ago", () => {
    const token = issuePreviewToken(SECRET, MERCHANT, THEME, NOW);
    expect(verifyPreviewToken(SECRET, token, NOW + 60_000)).toEqual({
      merchantId: MERCHANT,
      themeId: THEME,
    });
  });

  it("rejects expired tokens", () => {
    const token = issuePreviewToken(SECRET, MERCHANT, THEME, NOW);
    expect(verifyPreviewToken(SECRET, token, NOW + 11 * 60_000)).toBeNull();
  });

  it("rejects forged tokens", () => {
    const token = issuePreviewToken("wrong-secret", MERCHANT, THEME, NOW);
    expect(verifyPreviewToken(SECRET, token, NOW + 60_000)).toBeNull();
  });

  it("rejects tampered payloads", () => {
    const token = issuePreviewToken(SECRET, MERCHANT, THEME, NOW);
    const [h, p, s] = token.split(".");
    const evil = Buffer.from(
      JSON.stringify({ m: "99999999-9999-4999-8999-999999999999", t: THEME, e: NOW + 600_000 }),
    ).toString("base64url");
    expect(verifyPreviewToken(SECRET, `${h}.${evil}.${s}`, NOW + 60_000)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyPreviewToken(SECRET, "not-a-token", NOW)).toBeNull();
    expect(verifyPreviewToken(SECRET, "", NOW)).toBeNull();
  });
});
