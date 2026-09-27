import { describe, expect, it } from "vitest";
import {
  CANNED_RESPONSES,
  findMacroByShortcut,
  interpolateMacro,
  searchCannedResponses,
} from "./support-canned-responses";

describe("Support Canned Responses & Macro Engine", () => {
  it("defines standard macros across key support categories", () => {
    expect(CANNED_RESPONSES.length).toBeGreaterThanOrEqual(7);
    const shortcuts = CANNED_RESPONSES.map((r) => r.shortcut);
    expect(shortcuts).toContain("/greeting");
    expect(shortcuts).toContain("/order");
    expect(shortcuts).toContain("/shipping");
    expect(shortcuts).toContain("/refund");
    expect(shortcuts).toContain("/resolved");

    for (const macro of CANNED_RESPONSES) {
      expect(macro.shortcut.startsWith("/")).toBe(true);
      expect(macro.title.length).toBeGreaterThan(0);
      expect(macro.body.length).toBeGreaterThan(0);
      expect(macro.bodyBn.length).toBeGreaterThan(0);
    }
  });

  it("finds macros by shortcut exact match or without slash", () => {
    const macro = findMacroByShortcut("/greeting");
    expect(macro).toBeDefined();
    expect(macro?.shortcut).toBe("/greeting");

    const macroNoSlash = findMacroByShortcut("shipping");
    expect(macroNoSlash).toBeDefined();
    expect(macroNoSlash?.shortcut).toBe("/shipping");

    const notFound = findMacroByShortcut("/non_existent_shortcut");
    expect(notFound).toBeUndefined();
  });

  it("interpolates placeholder variables accurately", () => {
    const template =
      "Hello {{merchantName}}, your order #{{orderNumber}} via {{courierName}} is on track!";
    const interpolated = interpolateMacro(template, {
      merchantName: "Rahman Store",
      orderNumber: "ORD-9821",
      courierName: "Pathao Express",
    });

    expect(interpolated).toBe(
      "Hello Rahman Store, your order #ORD-9821 via Pathao Express is on track!",
    );
  });

  it("safely falls back for missing interpolation variables", () => {
    const template =
      "Hi {{merchantName}}, order {{orderNumber}} will be handled by {{operatorName}}.";
    const interpolated = interpolateMacro(template, {});
    expect(interpolated).toBe(
      "Hi our store, order [Order #] will be handled by Specialist.",
    );
  });

  it("searches and filters canned responses by query and category", () => {
    const refundMacros = searchCannedResponses("", "refunds_returns");
    expect(refundMacros.every((m) => m.category === "refunds_returns")).toBe(
      true,
    );
    expect(refundMacros.length).toBeGreaterThanOrEqual(1);

    const searchResults = searchCannedResponses("refund");
    expect(searchResults.some((m) => m.shortcut === "/refund")).toBe(true);

    const banglaSearch = searchCannedResponses("অভিবাদন");
    expect(banglaSearch.some((m) => m.shortcut === "/greeting")).toBe(true);
  });
});

describe("TODO-5 — advisory-only /refund macro (HITL approvals UI)", () => {
  it("uses the shared guardrail advisory templates for EN+BN bodies", async () => {
    const {
      ADVISORY_REFUND_TEMPLATE_EN,
      ADVISORY_REFUND_TEMPLATE_BN,
    } = await import("./support-guardrails");
    const macro = findMacroByShortcut("/refund")!;
    expect(macro.templateEn).toBe(ADVISORY_REFUND_TEMPLATE_EN);
    expect(macro.templateBn).toBe(ADVISORY_REFUND_TEMPLATE_BN);
    expect(macro.body).toBe(ADVISORY_REFUND_TEMPLATE_EN);
    expect(macro.bodyBn).toBe(ADVISORY_REFUND_TEMPLATE_BN);
    expect(macro.variables).toContain("ticketId");
    expect(macro.variables).toContain("orderNumber");
  });

  it("interpolates ticket + order references with no initiated-claim", async () => {
    const { checkRefundCopy, screenOutbound } = await import(
      "./support-guardrails"
    );
    const macro = findMacroByShortcut("/refund")!;
    const en = interpolateMacro(macro.templateEn, {
      ticketId: "#TKT-ABCD1234",
      orderNumber: "1002",
    });
    expect(en).toContain("#TKT-ABCD1234");
    expect(en).toContain("#1002");
    expect(en).not.toMatch(/initiated a refund|has been initiated/i);
    expect(checkRefundCopy(en)).toMatchObject({ truthful: true });
    expect(screenOutbound(en, { pinned: true }).allowed).toBe(true);

    const bn = interpolateMacro(macro.templateBn, {
      ticketId: "#TKT-ABCD1234",
      orderNumber: "1002",
    });
    expect(bn).toContain("#TKT-ABCD1234");
    expect(checkRefundCopy(bn)).toMatchObject({ truthful: true });
    expect(screenOutbound(bn, { pinned: true }).allowed).toBe(true);
  });

  it("falls back to a ticket placeholder that keeps the ticket reference", async () => {
    const { checkRefundCopy } = await import("./support-guardrails");
    const macro = findMacroByShortcut("/refund")!;
    // Operator consoles (e.g. /root/ai) interpolate without a ticketId.
    const en = interpolateMacro(macro.templateEn, { orderNumber: "1002" });
    expect(en).toMatch(/ticket/i);
    expect(checkRefundCopy(en)).toMatchObject({ truthful: true });
  });
});
