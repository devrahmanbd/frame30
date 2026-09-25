import { describe, expect, it } from "vitest";
import {
  getVerifiedContact,
  isVerifiedBdPhone,
  shouldShowSupportPhone,
} from "./support-contact.server";

describe("support-contact truth", () => {
  it("returns ORG_NAP contact by default (single source)", () => {
    const c = getVerifiedContact();
    expect(c.email).toContain("framique.com");
    expect(c.source).toBe("org_nap");
    // Must never return scattered fakes
    expect(c.phone ?? "").not.toBe("+880 9612-345678");
    expect(c.whatsapp ?? "").not.toBe("+880 1700-000000");
  });

  it("deny: unverified merchant phone is hidden, never rendered", () => {
    const c = getVerifiedContact({ supportPhone: "not-a-phone" });
    expect(c.phone).toBeNull();
    expect(shouldShowSupportPhone("not-a-phone")).toBe(false);
    expect(shouldShowSupportPhone(null)).toBe(false);
    expect(shouldShowSupportPhone(undefined)).toBe(false);
  });

  it("accepts merchant-verified BD phone", () => {
    expect(isVerifiedBdPhone("01712345678")).toBe(true);
    expect(isVerifiedBdPhone("+8801712345678")).toBe(true);
    expect(isVerifiedBdPhone("01012345678")).toBe(false);
    const c = getVerifiedContact({ supportPhone: "01712345678" });
    expect(c.phone).toBe("+8801712345678");
    expect(c.source).toBe("merchant_verified");
    expect(shouldShowSupportPhone("01712345678")).toBe(true);
  });

  it("replay: same input yields same contact payload", () => {
    const a = getVerifiedContact({ supportPhone: "01712345678" });
    const b = getVerifiedContact({ supportPhone: "01712345678" });
    expect(a).toEqual(b);
  });
});
