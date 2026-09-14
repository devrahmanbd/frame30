/**
 * §5 contract — step-up coverage, PII masking, export reason gate and console
 * headers are asserted here so the hardening sweep cannot silently regress.
 */
import { describe, expect, it } from "vitest";
import { DANGEROUS } from "./authz";
import { STEP_UP_MAX_AGE_SECONDS, stepUpClassFor, unmappedDangerousPermissions } from "./step-up";
import {
  EXPORT_REASON_MIN,
  EXPORT_REASON_THRESHOLD,
  checkExportReason,
  needsExportReason,
} from "./export-controls";
import { CONSOLE_PREFIXES, consoleSecurityHeaders, isConsolePath } from "./console-headers";
import { maskEmail, maskPhone, minimisePii } from "./pii";

describe("§5 — step-up MFA", () => {
  it("maps every dangerous permission to an action class", () => {
    expect(unmappedDangerousPermissions()).toEqual([]);
    for (const permission of DANGEROUS) expect(stepUpClassFor(permission), permission).not.toBeNull();
  });

  it("keeps the grant window short", () => {
    expect(STEP_UP_MAX_AGE_SECONDS).toBeLessThanOrEqual(900);
  });
});

describe("§5 — bulk export reason gate", () => {
  it("only asks above the threshold", () => {
    expect(needsExportReason(EXPORT_REASON_THRESHOLD)).toBe(false);
    expect(needsExportReason(EXPORT_REASON_THRESHOLD + 1)).toBe(true);
  });

  it("rejects a missing or throwaway reason for a bulk export", () => {
    const rows = EXPORT_REASON_THRESHOLD + 1;
    expect(checkExportReason(rows, null)).toBe("reason_required");
    expect(checkExportReason(rows, "x".repeat(EXPORT_REASON_MIN - 1))).toBe("reason_too_short");
    expect(checkExportReason(rows, "monthly accounting handover")).toBeNull();
    expect(checkExportReason(10, null)).toBeNull();
  });
});

describe("§5 — console headers", () => {
  it("covers every console prefix and no storefront path", () => {
    for (const prefix of CONSOLE_PREFIXES) expect(isConsolePath(prefix), prefix).toBe(true);
    expect(isConsolePath("/store/demo")).toBe(false);
  });

  it("forbids framing and indexing", () => {
    const headers = consoleSecurityHeaders();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-robots-tag"]).toContain("noindex");
  });
});

describe("§5 — PII minimisation", () => {
  it("masks contact details without the unmask grant", () => {
    expect(maskEmail("shopper@example.com")).not.toContain("shopper@");
    expect(maskPhone("+8801712345678")).not.toContain("1712345");
    const row = minimisePii({ email: "shopper@example.com", phone: "+8801712345678" }, { canUnmask: false });
    expect(row.email).not.toBe("shopper@example.com");
    expect(minimisePii({ email: "shopper@example.com" }, { canUnmask: true }).email).toBe(
      "shopper@example.com",
    );
  });
});