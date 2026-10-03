import { describe, it, expect } from "vitest";
import {
  MENU_SLOTS,
  WIDGET_API,
  authorizeWidgetCall,
  canReplaceMenu,
  canonicalJson,
  compareSemver,
  highestRisk,
  isBlockKey,
  isBreakingChange,
  isForwardVersion,
  isMenuSlot,
  menuReadGranted,
  missingScopes,
  normalizeScopes,
  parseSemver,
  scopeDef,
  validateBundle,
} from "./marketplace-scopes";

describe("scopes", () => {
  it("drops unknown scopes and de-duplicates", () => {
    const r = normalizeScopes([
      "read_shop",
      "read_shop",
      "mine_bitcoin",
      "write_cart",
    ]);
    expect(r.scopes).toEqual(["read_shop", "write_cart"]);
    expect(r.unknown).toEqual(["mine_bitcoin"]);
  });

  it("escalates risk to the worst scope requested", () => {
    expect(highestRisk(["read_shop"])).toBe("low");
    expect(highestRisk(["read_shop", "write_cart"])).toBe("medium");
    expect(highestRisk(["read_shop", "read_customers"])).toBe("high");
  });

  it("reports scopes the merchant has not granted", () => {
    expect(missingScopes(["read_shop", "write_cart"], ["read_shop"])).toEqual([
      "write_cart",
    ]);
    expect(missingScopes(["read_shop"], ["read_shop", "write_cart"])).toEqual(
      [],
    );
  });
});

describe("semver", () => {
  it("parses and orders versions", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("1.2")).toBeNull();
    expect(compareSemver("1.10.0", "1.9.9")).toBeGreaterThan(0);
  });

  it("only accepts forward submissions", () => {
    expect(isForwardVersion("1.0.0", null)).toBe(true);
    expect(isForwardVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isForwardVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isForwardVersion("0.9.0", "1.0.0")).toBe(false);
  });

  it("flags major bumps as breaking", () => {
    expect(isBreakingChange("2.0.0", "1.4.0")).toBe(true);
    expect(isBreakingChange("1.5.0", "1.4.0")).toBe(false);
  });
});

describe("content addressing", () => {
  it("hashes key order independently", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it("rejects oversized, empty and dynamic-code bundles", () => {
    expect(
      validateBundle({ entry: "export default 1" }, ["read_shop"]).ok,
    ).toBe(true);
    expect(validateBundle({}, ["read_shop"]).errors).toContain("bundle.empty");
    expect(
      validateBundle({ entry: "eval('x')" }, ["read_shop"]).errors,
    ).toContain("bundle.dynamic_code");
    expect(validateBundle({ entry: "ok" }, []).errors).toContain(
      "bundle.no_scopes",
    );
    const big = { entry: "x".repeat(600_000) };
    expect(validateBundle(big, ["read_shop"]).errors).toContain(
      "bundle.too_large",
    );
  });

  it("validates block keys", () => {
    expect(isBlockKey("hero-banner")).toBe(true);
    expect(isBlockKey("Hero")).toBe(false);
    expect(isBlockKey("a")).toBe(false);
  });
});

describe("widget API authorization", () => {
  it("rejects malformed envelopes", () => {
    expect(authorizeWidgetCall({ method: "shop.info" }, ["read_shop"])).toEqual(
      {
        allowed: false,
        reason: "malformed",
      },
    );
  });

  it("rejects unknown methods", () => {
    const v = authorizeWidgetCall({ v: 1, id: "1", method: "fs.read" }, [
      "read_shop",
    ]);
    expect(v).toMatchObject({ allowed: false, reason: "unknown_method" });
  });

  it("denies calls whose scope was never granted", () => {
    const v = authorizeWidgetCall({ v: 1, id: "1", method: "cart.add" }, [
      "read_shop",
    ]);
    expect(v).toMatchObject({ allowed: false, reason: "scope_denied" });
  });

  it("allows granted calls and marks writes", () => {
    expect(
      authorizeWidgetCall({ v: 1, id: "1", method: "cart.add" }, [
        "write_cart",
      ]),
    ).toEqual({
      allowed: true,
      method: "cart.add",
      write: true,
    });
    expect(
      authorizeWidgetCall({ v: 1, id: "2", method: "shop.info" }, [
        "read_shop",
      ]),
    ).toEqual({
      allowed: true,
      method: "shop.info",
      write: false,
    });
  });
});

describe("TRACK M — menu scopes and fill vocabulary", () => {
  it("registers read_menus (low) and replace_menus (high) in the catalogue", () => {
    const read = scopeDef("read_menus");
    const replace = scopeDef("replace_menus");
    expect(read?.risk).toBe("low");
    expect(replace?.risk).toBe("high");
    expect(highestRisk(["read_menus"])).toBe("low");
    expect(highestRisk(["read_menus", "replace_menus"])).toBe("high");
  });

  it("normalises the new scopes and still rejects invented ones", () => {
    const r = normalizeScopes(["read_menus", "replace_menus", "drain_wallet"]);
    expect(r.scopes).toEqual(["read_menus", "replace_menus"]);
    expect(r.unknown).toEqual(["drain_wallet"]);
  });

  it("exposes menus.list as a read-only bridge method behind read_menus", () => {
    expect(WIDGET_API["menus.list"]).toEqual({
      scope: "read_menus",
      write: false,
    });
    expect(
      authorizeWidgetCall({ v: 1, id: "1", method: "menus.list" }, [
        "read_menus",
      ]),
    ).toEqual({ allowed: true, method: "menus.list", write: false });
    expect(
      authorizeWidgetCall({ v: 1, id: "1", method: "menus.list" }, [
        "read_shop",
      ]),
    ).toMatchObject({ allowed: false, reason: "scope_denied" });
  });

  it("keeps menus readable by default for any storefront plugin", () => {
    expect(menuReadGranted(["read_menus"])).toBe(true);
    // Every widget contribution already requires render_storefront, so
    // existing installs read menus with no fresh consent screen.
    expect(menuReadGranted(["render_storefront"])).toBe(true);
    expect(menuReadGranted(["read_orders"])).toBe(false);
    expect(menuReadGranted([])).toBe(false);
  });

  it("requires BOTH the replace scope and the review flag for replacement", () => {
    expect(canReplaceMenu(["replace_menus"], true)).toBe(true);
    expect(canReplaceMenu(["replace_menus"], false)).toBe(false);
    expect(canReplaceMenu(["render_storefront"], true)).toBe(false);
    expect(canReplaceMenu([], true)).toBe(false);
    expect(canReplaceMenu(["replace_menus"], undefined as never)).toBe(false);
  });

  it("sanctions exactly the three menu fill points", () => {
    expect([...MENU_SLOTS]).toEqual([
      "menu_bar",
      "menu_dropdown",
      "menu_drawer",
    ]);
    for (const slot of MENU_SLOTS) expect(isMenuSlot(slot)).toBe(true);
    expect(isMenuSlot("header")).toBe(false);
    expect(isMenuSlot(undefined)).toBe(false);
  });
});
