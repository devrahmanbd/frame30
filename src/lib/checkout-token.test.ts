/**
 * Checkout-hold token strength (frame30 token-hardening).
 *
 * Defects (verified Oct 2026): `checkoutToken`s were predictable client-minted
 * strings (`${slug}-hold-${Math.random()…}${Date.now()…}` — Math.random is not
 * a CSPRNG and Date.now is guessable), while `consumeStock` matched on token
 * ONLY with no merchant scope.
 *
 * This suite pins the mint in BOTH route files: the `${slug}-hold-` prefix
 * shape is kept (recognizable in logs; parsed by nothing — the server matches
 * the full token AND the merchant scope), the random part carries UUID
 * entropy, and every mint is unique.
 *
 * The remainder sweep (Oct 2026) verified every other session/hold/invite/
 * reset/passwordless flow reachable by shoppers or merchants: order access
 * tokens use CSPRNG bytes, the hold-token fallback derives from the
 * UUID-backed idempotency key, `order_number` is display-only, every
 * `stock_holds` token lookup is merchant-scoped, and `carts.server` mints
 * nothing with `Math.random`. The "server token-strength pins" block below
 * locks those properties in.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mintCheckoutToken as mintStoreCheckoutToken } from "../routes/store.$slug.checkout";
import { mintCheckoutToken as mintCheckoutToken } from "../routes/checkout";

const minters = {
  "store.$slug.checkout": mintStoreCheckoutToken,
  checkout: mintCheckoutToken,
} as const;

for (const [name, mint] of Object.entries(minters)) {
  describe(`mintCheckoutToken (${name})`, () => {
    it("keeps the `${slug}-hold-` prefix shape", () => {
      expect(mint("demo-shop").startsWith("demo-shop-hold-")).toBe(true);
    });

    it("carries UUID entropy in the random part", () => {
      const suffix = mint("demo-shop").slice("demo-shop-hold-".length);
      // crypto.randomUUID, dash-stripped per the payment-keys convention.
      expect(suffix).toMatch(/^[0-9a-f]{32}$/);
    });

    it("mints unique tokens across sessions", () => {
      const seen = new Set(
        Array.from({ length: 500 }, () => mint("demo-shop")),
      );
      expect(seen.size).toBe(500);
    });

    it("still mints a usable token where WebCrypto randomUUID is missing (legacy fallback)", () => {
      const holder = globalThis.crypto as unknown as {
        randomUUID?: () => string;
      };
      const orig = holder.randomUUID;
      try {
        holder.randomUUID = undefined;
        const a = mint("demo-shop");
        const b = mint("demo-shop");
        expect(a.startsWith("demo-shop-hold-")).toBe(true);
        expect(a.length).toBeGreaterThan("demo-shop-hold-".length + 8);
        expect(a).not.toBe(b);
      } finally {
        holder.randomUUID = orig;
      }
    });
  });
}

describe("mint source pins", () => {
  const routes = [
    "src/routes/store.$slug.checkout.tsx",
    "src/routes/checkout.tsx",
  ];

  it("both route minters use crypto.randomUUID, never Math.random", () => {
    for (const path of routes) {
      const src = readFileSync(path, "utf8");
      const minter = src.match(/export function mintCheckoutToken[\s\S]*?\n\}/);
      expect(minter?.[0], `${path} must export mintCheckoutToken`).toBeTruthy();
      expect(minter![0]).toContain("randomUUID");
      // Date.now beacons elsewhere in these files are fine — the HOLD minter
      // itself must not use guessable randomness.
      expect(minter![0]).not.toContain("Math.random");
    }
  });

  it("both routes mint the hold token through the shared minter", () => {
    for (const path of routes) {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("mintCheckoutToken(slug)");
      expect(src).toContain("${slug}-hold-");
    }
  });
});

describe("server token-strength pins (frame30 remainder sweep)", () => {
  const checkoutServer = readFileSync("src/lib/checkout.server.ts", "utf8");
  const ordersServer = readFileSync("src/lib/orders.server.ts", "utf8");
  const cartsServer = readFileSync("src/lib/carts.server.ts", "utf8");

  it("every stock_holds token lookup is merchant-scoped", () => {
    const tokenUses = [...checkoutServer.matchAll(/\.eq\("checkout_token"/g)];
    expect(tokenUses.length).toBeGreaterThan(0);
    for (const m of tokenUses) {
      const window = checkoutServer.slice(m.index!, m.index! + 300);
      expect(window).toContain('.eq("merchant_id"');
    }
  });

  it("order access tokens use CSPRNG bytes, never Math.random", () => {
    const mint = ordersServer.match(/const accessToken =[\s\S]*?;/);
    expect(mint?.[0]).toBeTruthy();
    expect(mint![0]).toContain("getRandomValues");
    expect(mint![0]).not.toContain("Math.random");
  });

  it("hold-token fallback derives from the UUID-backed idempotency key", () => {
    expect(ordersServer).toContain(
      "input.checkoutToken ?? `${input.idempotencyKey}-hold`",
    );
  });

  it("order_number is display-only: never a query filter, access gated by access_token", () => {
    expect(ordersServer).not.toContain('.eq("order_number"');
    expect(ordersServer).toContain("row.access_token !== accessToken");
  });

  it("carts.server mints no tokens with Math.random", () => {
    expect(cartsServer).not.toContain("Math.random");
  });
});
