/**
 * Frame30 storefront resilience — route wiring pins.
 *
 * Every `store.$slug.*` route plus the root must render the shared
 * `StorefrontError` boundary (localized message + loader-invalidating retry)
 * instead of crashing, while null payloads keep mapping to `notFound()` (or
 * the equivalent missing-URL/empty-outcome handling) for genuine unknown
 * slugs. Loader catches route infrastructure errors (5xx/timeout) to the
 * boundary via `isStorefrontInfrastructureError`, never to a 404.
 *
 * Also pins the two sibling fixes in the same workstream:
 * - order thumbnails render through `StoreImage`'s degrade path (raw source
 *   → placeholder), never a bare `<img>` that blanks on transform failure;
 * - the checkout rescue wiring (asserted in depth by
 *   `store.$slug.checkout.rescue.test.ts`).
 *
 * Source asserts (repo precedent: `checkout.session-key.test.ts`) — they pin
 * wiring that hermetic e2e cannot deterministically trigger without a live
 * backend.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STORE_ROUTES = [
  "src/routes/store.$slug.index.tsx",
  "src/routes/store.$slug.cart.tsx",
  "src/routes/store.$slug.checkout.tsx",
  "src/routes/store.$slug.p.$productSlug.tsx",
  "src/routes/store.$slug.c.$collectionSlug.tsx",
  "src/routes/store.$slug.search.tsx",
  "src/routes/store.$slug.order.$orderId.tsx",
  "src/routes/store.$slug.account.tsx",
  "src/routes/store.$slug.pages.$pageSlug.tsx",
  "src/routes/store.$slug.blog.index.tsx",
  "src/routes/store.$slug.blog.$slug.tsx",
  "src/routes/store.$slug.track.tsx",
];

/** Routes whose loaders fetch backend data and must map infra errors. */
const LOADER_ROUTES = STORE_ROUTES.filter(
  (p) =>
    !p.endsWith("store.$slug.track.tsx") &&
    // Account degrades a failed chrome fetch to null by design (the built-in
    // dashboard renders regardless); it still gets the shared boundary.
    !p.endsWith("store.$slug.account.tsx"),
);

describe("shared storefront errorComponent", () => {
  for (const path of STORE_ROUTES) {
    it(`${path} renders StorefrontError`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("StorefrontError");
      expect(src).toContain("errorComponent");
    });
  }

  it("root renders a localized errorComponent with retry", () => {
    const src = readFileSync("src/routes/__root.tsx", "utf8");
    // Generic document-level copy (not the storefront-specific shared one —
    // this boundary also covers non-store routes like the dashboard).
    expect(src).toContain("errorComponent");
    expect(src).toContain("RootError");
    expect(src).toContain("router.invalidate()");
    expect(src).toContain("Try again");
  });
});

describe("loader error mapping (infra → retry, null → 404)", () => {
  for (const path of LOADER_ROUTES) {
    it(`${path} routes infrastructure errors to the boundary`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("isStorefrontInfrastructureError");
      expect(src).toContain("catch");
    });
  }

  it("genuine unknown slugs still 404 (index/cart/checkout/collection/blog)", () => {
    for (const path of [
      "src/routes/store.$slug.index.tsx",
      "src/routes/store.$slug.cart.tsx",
      "src/routes/store.$slug.checkout.tsx",
      "src/routes/store.$slug.c.$collectionSlug.tsx",
      "src/routes/store.$slug.blog.index.tsx",
      "src/routes/store.$slug.blog.$slug.tsx",
      "src/routes/store.$slug.order.$orderId.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).toContain("throw notFound()");
    }
  });

  it("product/page misses keep the missing-URL verdict (redirect/gone/404)", () => {
    for (const path of [
      "src/routes/store.$slug.p.$productSlug.tsx",
      "src/routes/store.$slug.pages.$pageSlug.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).toContain("handleMissingStoreUrl");
    }
  });
});

describe("order thumbnails via StoreImage", () => {
  const SRC = readFileSync("src/routes/store.$slug.order.$orderId.tsx", "utf8");

  it("renders item images through the StoreImage degrade path", () => {
    expect(SRC).toContain("StoreImage");
    expect(SRC).toContain("fallbackSrc={i.image_url}");
  });

  it("has no bare <img> left on the thumbnail", () => {
    expect(SRC).not.toContain("<img src={i.image_url}");
  });
});
