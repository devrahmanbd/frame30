import { describe, expect, it } from "vitest";
import { SCOPES as WIDGET_SCOPES } from "./marketplace-scopes";
import { SCOPES as API_SCOPES } from "./api-scopes";
import { HOOK_SCOPE, hookAllowed, widgetToApiScopes } from "./scope-adapter";

describe("scope adapter (R2-0)", () => {
  it("maps every widget scope to ≥1 real API scope", () => {
    for (const id of WIDGET_SCOPES.map((s) => s.id)) {
      const mapped = widgetToApiScopes(id);
      expect(mapped.length).toBeGreaterThan(0);
      for (const m of mapped) expect(API_SCOPES).toContain(m);
    }
  });
  it("never invents API scopes from unknown widget input", () => {
    expect(widgetToApiScopes("drain_wallet")).toEqual([]);
  });
  it("covers all four hooks with non-empty scope sets", () => {
    for (const hook of [
      "cart.calculate",
      "checkout.validate",
      "order.created",
      "product.saved",
    ] as const) {
      const req = HOOK_SCOPE[hook];
      expect(req.length).toBeGreaterThan(0);
      for (const s of req) expect(WIDGET_SCOPES.map((x) => x.id)).toContain(s);
    }
  });
  it("hookAllowed requires every granted scope and fails closed otherwise", () => {
    expect(hookAllowed("order.created", ["read_orders"])).toBe(true);
    expect(hookAllowed("order.created", [])).toBe(false);
    expect(hookAllowed("product.saved", ["read_products"])).toBe(false);
    expect(
      hookAllowed("product.saved", ["read_products", "write_products"]),
    ).toBe(true);
    expect(hookAllowed("cart.calculate", ["write_cart"])).toBe(false);
    expect(
      hookAllowed("unknown.hook" as never, ["read_products", "write_cart"]),
    ).toBe(false);
  });
});
