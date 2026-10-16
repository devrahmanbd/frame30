/**
 * Theme capability grants — TDD: default-deny, per-install least privilege,
 * and the forbidden-field wire-shape guarantee (no price/stock/tenant/
 * secret fields passable even when the theme sends them).
 */
import { describe, expect, it } from "vitest";
import {
  buildThemeGrants,
  containsForbiddenFields,
  findForbiddenFields,
  isForbiddenParamKey,
  isNavigationAllowed,
  revokeThemeGrants,
  sanitizeThemeParams,
  themeRequiredScope,
  themeScopeFor,
  THEME_METHODS,
} from "./capabilities";

describe("buildThemeGrants — default-deny", () => {
  it("grants nothing by default", () => {
    expect(buildThemeGrants({})).toEqual({
      granted: [],
      navigateAllowlist: [],
    });
    expect(buildThemeGrants()).toEqual({ granted: [], navigateAllowlist: [] });
  });

  it("grants exactly the enabled capabilities, one scope each", () => {
    expect(buildThemeGrants({ storefrontRead: true }).granted).toEqual([
      "theme:storefront:read",
    ]);
    expect(buildThemeGrants({ variantSelect: true }).granted).toEqual([
      "theme:variant:select",
    ]);
    expect(buildThemeGrants({ cartAdd: true }).granted).toEqual([
      "theme:cart:add",
    ]);
    expect(buildThemeGrants({ navigate: true }).granted).toEqual([
      "theme:navigate",
    ]);
  });

  it("grants the full set only when every flag is explicit", () => {
    const set = buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
      navigate: true,
      navigateAllowlist: ["https://shop.example.com"],
    });
    expect(set.granted).toEqual([
      "theme:storefront:read",
      "theme:variant:select",
      "theme:cart:add",
      "theme:navigate",
    ]);
    expect(set.navigateAllowlist).toEqual(["https://shop.example.com"]);
  });

  it("keeps falsy flags denied (no truthy-string footguns)", () => {
    const set = buildThemeGrants({
      // @ts-expect-error — hostile/accidental non-boolean input stays denied
      cartAdd: "yes",
      // @ts-expect-error — same for numeric input
      navigate: 1,
    });
    expect(set.granted).toEqual([]);
  });

  it("normalizes the navigate allowlist to https origins only", () => {
    const set = buildThemeGrants({
      navigate: true,
      navigateAllowlist: [
        "https://shop.example.com",
        "http://evil.example.com",
        "javascript:alert(1)",
        "https://shop.example.com",
        "not a url",
      ],
    });
    expect(set.navigateAllowlist).toEqual(["https://shop.example.com"]);
  });
});

describe("THEME_METHODS — disjoint vocabulary", () => {
  it("exposes exactly the four theme methods", () => {
    expect(Object.keys(THEME_METHODS).sort()).toEqual([
      "cart.add",
      "navigate",
      "storefront.read",
      "variant.select",
    ]);
  });

  it("uses theme:* scopes, never widget scopes", () => {
    for (const method of Object.keys(THEME_METHODS)) {
      expect(themeScopeFor(method)).toMatch(/^theme:/);
    }
    // Widget-lane method names resolve to nothing in this lane.
    for (const m of [
      "shop.info",
      "products.list",
      "plugin.settings",
      "menus.list",
    ]) {
      expect(themeScopeFor(m)).toBeNull();
    }
    expect(themeRequiredScope("cart.add")).toBe("theme:cart:add");
  });

  it("marks only cart.add as a write", () => {
    expect(THEME_METHODS["cart.add"].write).toBe(true);
    expect(THEME_METHODS["storefront.read"].write).toBe(false);
    expect(THEME_METHODS["variant.select"].write).toBe(false);
    expect(THEME_METHODS["navigate"].write).toBe(false);
  });
});

describe("forbidden fields — wire shape never carries them", () => {
  const hostile = {
    variantId: "v-1",
    quantity: 2,
    price: 199,
    stock: 50,
    tenantId: "other-tenant",
    secret: "shhh",
    paymentStatus: "paid",
  };

  it("flags price/stock/tenant/secret/payment fields", () => {
    expect(containsForbiddenFields(hostile)).toBe(true);
    const hits = findForbiddenFields(hostile);
    expect(hits).toContain("price");
    expect(hits).toContain("stock");
    expect(hits).toContain("tenantId");
    expect(hits).toContain("secret");
    expect(hits).toContain("paymentStatus");
  });

  it("catches spelling variants (tenant_id, payment-status, APIKey)", () => {
    expect(containsForbiddenFields({ tenant_id: "x" })).toBe(true);
    expect(containsForbiddenFields({ "payment-status": "paid" })).toBe(true);
    expect(containsForbiddenFields({ APIKey: "k" })).toBe(true);
    expect(containsForbiddenFields({ nested: { deep: { total: 5 } } })).toBe(
      true,
    );
    expect(containsForbiddenFields({ items: [{ card: "4111" }] })).toBe(true);
  });

  it("passes clean commerce params", () => {
    expect(containsForbiddenFields({ variantId: "v-1", quantity: 2 })).toBe(
      false,
    );
    expect(containsForbiddenFields(undefined)).toBe(false);
    expect(containsForbiddenFields(null)).toBe(false);
    expect(containsForbiddenFields("variantId")).toBe(false);
  });

  it("sanitizer strips every forbidden field, nested included", () => {
    const { clean, stripped } = sanitizeThemeParams(hostile);
    expect(clean).toEqual({ variantId: "v-1", quantity: 2 });
    expect(JSON.stringify(clean)).not.toMatch(
      /price|stock|tenant|secret|payment/i,
    );
    expect(stripped.length).toBeGreaterThanOrEqual(5);
  });

  it("sanitizer drops __proto__ keys (pollution) and survives cycles", () => {
    const noProto = sanitizeThemeParams({
      ok: 1,
      ["__proto__"]: { polluted: true },
    });
    expect(noProto.clean).toBeDefined();
    // No OWN __proto__ property survives (plain access would still show
    // Object.prototype — assert ownership, not access).
    expect(
      Object.prototype.hasOwnProperty.call(noProto.clean, "__proto__"),
    ).toBe(false);
    expect(JSON.stringify(noProto.clean)).not.toContain("polluted");
    expect(noProto.stripped.some((s) => s.includes("__proto__"))).toBe(true);

    // Cycles terminate (seen-map) and preserve shape instead of hanging.
    const cyclic: Record<string, unknown> = { variantId: "v-1" };
    cyclic.self = cyclic;
    const cycled = sanitizeThemeParams({ cyclic });
    const cleanCyclic = (
      cycled.clean as Record<string, Record<string, unknown>>
    ).cyclic;
    expect(cleanCyclic.variantId).toBe("v-1");
    expect(cleanCyclic.self).toBe(cleanCyclic);
  });

  it("isForbiddenParamKey covers the forgery surface", () => {
    for (const k of [
      "price",
      "total",
      "stock",
      "inventory",
      "tenant",
      "tenantId",
      "shop_id",
      "merchant",
      "merchantId",
      "merchant_id",
      "merchant-id",
      "secret",
      "api_key",
      "token",
      "paymentStatus",
      "payment_token",
      "order_status",
      "password",
      "cvv",
    ]) {
      expect(isForbiddenParamKey(k), k).toBe(true);
    }
    for (const k of ["variantId", "quantity", "promoCode", "href", "fields"]) {
      expect(isForbiddenParamKey(k), k).toBe(false);
    }
  });

  it("flags merchant-tenant smuggling (slug/session own the tenant, never params)", () => {
    expect(containsForbiddenFields({ merchantId: "other" })).toBe(true);
    expect(containsForbiddenFields({ merchant_id: "other" })).toBe(true);
    expect(containsForbiddenFields({ merchant: "other" })).toBe(true);
    expect(
      findForbiddenFields({ variantId: "v", nested: { merchantId: "x" } }),
    ).toContain("nested.merchantId");
    const { clean, stripped } = sanitizeThemeParams({
      variantId: "v",
      quantity: 1,
      merchantId: "other",
    });
    expect(clean).toEqual({ variantId: "v", quantity: 1 });
    expect(stripped).toContain("merchantId");
  });
});

describe("revokeThemeGrants — kill-switch grant stripping", () => {
  const full = () =>
    buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
      navigate: true,
      navigateAllowlist: ["https://shop.example.com"],
    });

  it("strips every granted scope while preserving the allowlist", () => {
    const revoked = revokeThemeGrants(full());
    expect(revoked.granted).toEqual([]);
    expect(revoked.navigateAllowlist).toEqual(["https://shop.example.com"]);
  });

  it("never mutates its input; revoking empty stays empty", () => {
    const before = full();
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;
    revokeThemeGrants(before);
    expect(before).toEqual(snapshot);
    expect(revokeThemeGrants(buildThemeGrants())).toEqual({
      granted: [],
      navigateAllowlist: [],
    });
  });

  it("revoked sets authorize nothing (bridge denies per call)", async () => {
    const { authorizeThemeCall } = await import("./bridge-v2");
    const revoked = revokeThemeGrants(full());
    for (const method of Object.keys(THEME_METHODS)) {
      const params =
        method === "cart.add"
          ? { variantId: "v", quantity: 1 }
          : method === "variant.select"
            ? { variantId: "v" }
            : method === "navigate"
              ? { href: "/x" }
              : undefined;
      expect(
        authorizeThemeCall(
          { v: 2, id: "1", method, params },
          { granted: revoked.granted },
        ),
      ).toEqual({ allowed: false, reason: "scope_denied", method });
    }
  });
});

describe("isNavigationAllowed — allowlisted navigation", () => {
  const allow = ["https://shop.example.com"];

  it("allows same-store absolute paths", () => {
    expect(isNavigationAllowed("/products/x", [])).toBe(true);
    expect(isNavigationAllowed("/", [])).toBe(true);
  });

  it("allows allowlisted https origins, denies the rest", () => {
    expect(isNavigationAllowed("https://shop.example.com/c/women", allow)).toBe(
      true,
    );
    expect(isNavigationAllowed("https://shop.example.com", allow)).toBe(true);
    expect(isNavigationAllowed("https://evil.example.com/x", allow)).toBe(
      false,
    );
    expect(
      isNavigationAllowed("https://shop.example.com.evil.com/x", allow),
    ).toBe(false);
  });

  it("denies dangerous schemes and protocol-relative URLs", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<h1>x</h1>",
      "blob:https://shop.example.com/uuid",
      "vbscript:msgbox(1)",
      "//evil.example.com/x",
      "products/x",
      "",
      "   ",
      "https://shop.example.com/x\u0000y",
    ]) {
      expect(isNavigationAllowed(href, allow), href).toBe(false);
    }
  });

  it("denies non-string and oversize input", () => {
    expect(isNavigationAllowed(undefined, allow)).toBe(false);
    expect(isNavigationAllowed(null, allow)).toBe(false);
    expect(isNavigationAllowed({ href: "/x" }, allow)).toBe(false);
    expect(isNavigationAllowed("/" + "x".repeat(3000), allow)).toBe(false);
  });
});
