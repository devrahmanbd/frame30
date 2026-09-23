/**
 * Phase 2 R2-0 — interim canonical scope registry bridge.
 *
 * The 8 snake_case widget scopes (`marketplace-scopes.ts`) are canonical for
 * Phase 2. The 14 dotted scopes (`api-scopes.ts`) are the developer-platform
 * vocabulary. oauth.md is unapproved, so a static adapter freezes both sides
 * and fails closed on anything invented. `HOOK_SCOPE` is the gate map that
 * `plugin-hooks.server.ts:callOne` consults before any delivery.
 */
import { SCOPES as WIDGET_SCOPES } from "./marketplace-scopes";
import { SCOPES as API_SCOPES } from "./api-scopes";
import type { ServerHook } from "./plugin-manifest";

const WIDGET_TO_API: Record<string, readonly string[]> = {
  read_shop: ["plugins.read", "themes.read"],
  read_products: ["products.read"],
  write_products: ["products.write"],
  read_orders: ["orders.read"],
  read_customers: ["customers.read"],
  write_cart: ["orders.write"],
  write_analytics: ["analytics.read"],
  render_storefront: ["themes.write"],
};

const WIDGET_IDS = new Set(WIDGET_SCOPES.map((s) => s.id));

/** Fail-closed: unknown widget scope yields []. Never widens to a dotted grant. */
export function widgetToApiScopes(widgetScope: string): string[] {
  const mapped = WIDGET_TO_API[widgetScope] ?? [];
  if (!WIDGET_IDS.has(widgetScope)) return [];
  return mapped.filter((m) => (API_SCOPES as readonly string[]).includes(m));
}

/** Required granted widget scopes per server hook — enforced in `callOne`. */
export const HOOK_SCOPE: Record<ServerHook, readonly string[]> = {
  "cart.calculate": ["read_products", "write_cart"],
  "checkout.validate": ["read_orders", "write_cart"],
  "order.created": ["read_orders"],
  "product.saved": ["read_products", "write_products"],
};

/** True when `granted` satisfies every scope the hook requires. */
export function hookAllowed(
  hook: ServerHook,
  granted: readonly string[],
): boolean {
  const required = HOOK_SCOPE[hook] ?? [];
  if (!required.length) return false;
  return required.every((s) => granted.includes(s));
}
