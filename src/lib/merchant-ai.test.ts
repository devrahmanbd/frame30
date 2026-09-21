import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  flattenNav,
  permissionForPath,
} from "./console-nav";
import { MERCHANT_AI_ENABLED } from "./merchant-ai";

describe("merchant AI kill-switch", () => {
  it("is off: AI control is platform-operated only", () => {
    expect(MERCHANT_AI_ENABLED).toBe(false);
  });

  it("hides every /dashboard/ai/* destination from merchant nav", () => {
    const entries = flattenNav(ADMIN_NAV);
    expect(entries.map((e) => e.to)).not.toContain("/dashboard/ai/settings");
    expect(entries.map((e) => e.to)).not.toContain("/dashboard/ai/assistant");
    expect(
      entries.some((e) => e.to.startsWith("/dashboard/ai/")),
    ).toBe(false);
  });

  it("leaves the permission gate with nothing to grant on AI paths", () => {
    expect(permissionForPath("/dashboard/ai/settings")).toBeNull();
    expect(permissionForPath("/dashboard/ai/assistant")).toBeNull();
  });

  it("keeps the Framique-to-merchant support channel visible", () => {
    const entries = flattenNav(ADMIN_NAV);
    expect(entries.map((e) => e.to)).toContain("/dashboard/support");
  });
});
