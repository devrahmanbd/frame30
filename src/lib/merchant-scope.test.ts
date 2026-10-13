import { describe, expect, it } from "vitest";
import {
  ACTIVE_MERCHANT_COOKIE,
  HOST_ACTIVE_MERCHANT_COOKIE,
  parseActiveMerchantCookie,
  pickMembership,
} from "./merchant-scope.server";

const A = "b47532e5-9649-4ebd-93a9-06fa2917c00e";
const B = "b0ba0000-0000-4000-8000-000000000001";
const rows = [{ merchant_id: A }, { merchant_id: B }];

describe("parseActiveMerchantCookie", () => {
  it("extracts a valid UUID hint", () => {
    expect(
      parseActiveMerchantCookie(`foo=1; ${ACTIVE_MERCHANT_COOKIE}=${B}; x=y`),
    ).toBe(B);
  });

  it("rejects missing, empty, and malformed values", () => {
    expect(parseActiveMerchantCookie(null)).toBeNull();
    expect(parseActiveMerchantCookie("")).toBeNull();
    expect(parseActiveMerchantCookie(`${ACTIVE_MERCHANT_COOKIE}=`)).toBeNull();
    expect(
      parseActiveMerchantCookie(`${ACTIVE_MERCHANT_COOKIE}=../../etc`),
    ).toBeNull();
    expect(
      parseActiveMerchantCookie(`${ACTIVE_MERCHANT_COOKIE}=b47532e5-xxxx`),
    ).toBeNull();
  });
});

describe("pickMembership", () => {
  it("prefers the hinted membership", () => {
    expect(pickMembership(rows, B)).toEqual({ merchant_id: B });
  });

  it("ignores a forged hint naming a non-member and falls back to first", () => {
    expect(
      pickMembership(rows, "00000000-0000-4000-8000-000000000000"),
    ).toEqual({ merchant_id: A });
  });

  it("resolves a single membership without any hint", () => {
    expect(pickMembership([{ merchant_id: A }], null)).toEqual({
      merchant_id: A,
    });
  });

  it("returns null with no memberships at all", () => {
    expect(pickMembership([], B)).toBeNull();
    expect(pickMembership([], null)).toBeNull();
  });
});

describe("parseActiveMerchantCookie dual-read (origin-split step 4)", () => {
  it("honors a legacy-only header: old sessions keep working", () => {
    expect(parseActiveMerchantCookie(`${ACTIVE_MERCHANT_COOKIE}=${B}`)).toBe(B);
  });

  it("reads the __Host- successor when only the new cookie is present", () => {
    expect(
      parseActiveMerchantCookie(`${HOST_ACTIVE_MERCHANT_COOKIE}=${A}`),
    ).toBe(A);
  });

  it("prefers the new cookie when both are present", () => {
    expect(
      parseActiveMerchantCookie(
        `${ACTIVE_MERCHANT_COOKIE}=${B}; ${HOST_ACTIVE_MERCHANT_COOKIE}=${A}`,
      ),
    ).toBe(A);
  });

  it("falls back to the legacy cookie when the new value is malformed", () => {
    expect(
      parseActiveMerchantCookie(
        `${HOST_ACTIVE_MERCHANT_COOKIE}=../../etc; ${ACTIVE_MERCHANT_COOKIE}=${B}`,
      ),
    ).toBe(B);
  });

  it("uses the new cookie when the legacy value is malformed", () => {
    expect(
      parseActiveMerchantCookie(
        `${ACTIVE_MERCHANT_COOKIE}=not-a-uuid; ${HOST_ACTIVE_MERCHANT_COOKIE}=${A}`,
      ),
    ).toBe(A);
  });

  it("rejects both-malformed headers", () => {
    expect(
      parseActiveMerchantCookie(
        `${ACTIVE_MERCHANT_COOKIE}=nope; ${HOST_ACTIVE_MERCHANT_COOKIE}=also-nope`,
      ),
    ).toBeNull();
  });
});

describe("cross-tenant session reuse (hint-never-trust)", () => {
  const tenantA = [{ merchant_id: A }, { merchant_id: B }];
  // A valid UUID that names a store the caller is NOT a member of — e.g. a
  // cookie copied from tenant B's signed-in session into tenant A's browser.
  const tenantBStore = "11111111-2222-4333-8444-555555555555";

  it("never resolves to a merchant outside the caller's memberships", () => {
    const hint = parseActiveMerchantCookie(
      `${ACTIVE_MERCHANT_COOKIE}=${tenantBStore}; ${HOST_ACTIVE_MERCHANT_COOKIE}=${tenantBStore}`,
    );
    expect(hint).toBe(tenantBStore);
    const resolved = pickMembership(tenantA, hint);
    expect(resolved).not.toBeNull();
    expect(resolved!.merchant_id).not.toBe(tenantBStore);
    expect(resolved).toEqual({ merchant_id: A });
  });

  it("falls back to the caller's own store when only the foreign hint exists", () => {
    expect(pickMembership([{ merchant_id: A }], tenantBStore)).toEqual({
      merchant_id: A,
    });
  });
});
