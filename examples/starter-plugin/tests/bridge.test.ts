/**
 * Sandbox bridge allow-list — mirrors the real gate in
 * `src/lib/marketplace-scopes.ts` (`authorizeWidgetCall`, `WIDGET_API`).
 * Every postMessage the widget frame sends passes this check before the
 * host does any work.
 */
import { describe, expect, it } from "vitest";
import { WIDGET_API, authorizeWidgetCall } from "../../../src/lib/marketplace-scopes";
import manifestJson from "../manifest.json";

const granted = (manifestJson as { permissions: string[] }).permissions;

const msg = (method: string, params?: unknown) => ({
  v: 1,
  id: "1",
  method,
  params,
});

describe("starter bridge calls stay inside the granted scopes", () => {
  it("allows shop.info on the granted read_shop scope", () => {
    expect(authorizeWidgetCall(msg("shop.info"), granted)).toEqual({
      allowed: true,
      method: "shop.info",
      write: false,
    });
  });

  it("allows plugin.settings on the granted render_storefront scope", () => {
    const verdict = authorizeWidgetCall(msg("plugin.settings"), granted);
    expect(verdict).toEqual({
      allowed: true,
      method: "plugin.settings",
      write: false,
    });
  });

  it("allows orders.list on the granted read_orders scope", () => {
    expect(authorizeWidgetCall(msg("orders.list"), granted).allowed).toBe(true);
  });

  it("denies products.list: the starter manifest never grants read_products", () => {
    expect(authorizeWidgetCall(msg("products.list"), granted)).toEqual({
      allowed: false,
      reason: "scope_denied",
      method: "products.list",
    });
  });

  it("denies cart.add: no write_cart grant", () => {
    expect(authorizeWidgetCall(msg("cart.add"), granted)).toEqual({
      allowed: false,
      reason: "scope_denied",
      method: "cart.add",
    });
  });

  it("rejects unknown methods without touching scopes", () => {
    expect(authorizeWidgetCall(msg("shop.delete"), granted)).toEqual({
      allowed: false,
      reason: "unknown_method",
      method: "shop.delete",
    });
  });

  it("rejects malformed envelopes", () => {
    expect(
      authorizeWidgetCall({ v: 2, id: "1", method: "shop.info" }, granted),
    ).toEqual({ allowed: false, reason: "malformed" });
    expect(
      authorizeWidgetCall({ v: 1, id: "1" }, granted),
    ).toEqual({ allowed: false, reason: "malformed" });
  });

  it("every WIDGET_API method resolves against a known scope", () => {
    const scopes = new Set(granted);
    for (const [method, def] of Object.entries(WIDGET_API)) {
      const verdict = authorizeWidgetCall(msg(method), [...scopes]);
      if (scopes.has(def.scope)) expect(verdict.allowed).toBe(true);
      else
        expect(verdict).toMatchObject({
          allowed: false,
          reason: "scope_denied",
        });
    }
  });
});
