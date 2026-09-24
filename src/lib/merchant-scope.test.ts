import { describe, expect, it } from "vitest";
import {
  ACTIVE_MERCHANT_COOKIE,
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
