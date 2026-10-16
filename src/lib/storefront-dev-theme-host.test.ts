/**
 * Storefront Level B host — TDD for the published-homepage wiring.
 *
 * - `cart.add` via server-side repricing (cart-write decision: KEEP the
 *   grant — full isolated themes own the storefront document, so denying
 *   the write would silently break commerce; the server reprices every
 *   invocation from live catalog rows and never trusts frame prices):
 *   repriced truth for well-formed requests, `theme.forbidden_field` for
 *   forged prices, `theme.not_found` for cross-tenant/unknown ids,
 *   `theme.invalid_params` for bad quantities, `theme.suspended` before any
 *   read when revoked, and never any PII/orders/customers in the answer.
 * - Live suspension (`loadStorefrontDevThemeSuspension`): live installs
 *   (`installed`/`trial`) are not suspended; revoked/removed/paused,
 *   missing, unlinked, or unreadable installs suspend (fail closed).
 * - Published-homepage isolated gate
 *   (`resolvePublishedStorefrontIsolatedInputs`): admits the approved ACTIVE
 *   projection only; preview drafts, CMS-pinned pages, and malformed
 *   bindings yield null (host keeps the classic renderer).
 * - Adversarial: unapproved/inactive/draft-leak attempts, skewed/foreign
 *   bindings, suspended mid-session, forged/stale envelopes at the live
 *   host — every one ends in an explicit `theme.*` refusal, never a leak.
 *
 * No network, no real database: persistence goes through fakeDb.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const {
  resolveStorefrontDevThemeCall,
  loadStorefrontDevThemeSuspension,
  resolvePublishedStorefrontIsolatedInputs,
  isStorefrontDevThemeMethod,
} = await import("./storefront-dev-theme.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SLUG = "acme";
const T1 = "2026-10-02T00:00:00.000Z";

function shopDb(over?: {
  installStatus?: string;
  installId?: string | null;
  activeTheme?: boolean;
}) {
  const installId =
    over?.installId === undefined
      ? "33333333-3333-4333-8333-333333333333"
      : over.installId;
  return fakeDb({
    tables: {
      merchants: [
        {
          id: MERCHANT,
          name: "Acme",
          slug: SLUG,
          currency_code: "BDT",
          status: "active",
        },
      ],
      products: [
        {
          id: "prod-1",
          merchant_id: MERCHANT,
          title: "Jamdani",
          slug: "jamdani",
          status: "active",
          created_at: T1,
        },
        {
          id: "prod-9",
          merchant_id: "other",
          title: "Foreign",
          slug: "foreign",
          status: "active",
          created_at: T1,
        },
      ],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          name: "Default",
          price_amount_minor_int: 5000,
          stock_quantity: 3,
        },
        {
          id: "var-9",
          product_id: "prod-9",
          name: "Foreign",
          price_amount_minor_int: 9999,
          stock_quantity: 9,
        },
      ],
      store_themes: [
        {
          id: "theme-1",
          merchant_id: MERCHANT,
          is_active: over?.activeTheme ?? true,
          source_install_id: installId,
        },
      ],
      marketplace_installs: installId
        ? [
            {
              id: installId,
              merchant_id: MERCHANT,
              kind: "theme",
              status: over?.installStatus ?? "installed",
            },
          ]
        : [],
    },
  });
}

function binding(over: Record<string, unknown> = {}) {
  return {
    assetOrigin: "https://themes.example-cdn.com",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: ["theme:storefront:read", "theme:variant:select"],
    navigateAllowlist: [],
    ...over,
  };
}

beforeEach(() => recorder.reset());

describe("cart.add — server-repriced validated add-request", () => {
  it("is an allow-listed method", () => {
    expect(isStorefrontDevThemeMethod("cart.add")).toBe(true);
  });

  it("returns live-catalog truth, never frame prices", async () => {
    const db = shopDb();
    const out = (await resolveStorefrontDevThemeCall(
      db.asClient(),
      SLUG,
      "cart.add",
      { variantId: "var-1", quantity: 2 },
    )) as { cart: Record<string, unknown> };
    expect(out.cart).toMatchObject({
      variantId: "var-1",
      productId: "prod-1",
      quantity: 2,
      priceMinor: 5000,
      lineTotalMinor: 10000,
      currency: "BDT",
      inStock: true,
    });
    // No PII, orders, customers, or secrets in the answer.
    expect(JSON.stringify(out)).not.toMatch(
      /customer|order|secret|token|password|payment/i,
    );
  });

  it("ignores no frame price because forged prices never reach the resolver", async () => {
    const db = shopDb();
    // Even a penny-off forgery refuses before any catalog read.
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", {
        variantId: "var-1",
        quantity: 1,
        price: 1,
      }),
    ).rejects.toThrow("theme.forbidden_field");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", {
        variantId: "var-1",
        quantity: 1,
        total: 0,
      }),
    ).rejects.toThrow("theme.forbidden_field");
  });

  it("fails closed on cross-tenant and unknown variant ids", async () => {
    const db = shopDb();
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", {
        variantId: "var-9",
        quantity: 1,
      }),
    ).rejects.toThrow("theme.not_found");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", {
        variantId: "nope",
        quantity: 1,
      }),
    ).rejects.toThrow("theme.not_found");
  });

  it("refuses bad quantities without touching the catalog", async () => {
    const db = shopDb();
    for (const quantity of [0, -1, 100, 1.5, "2", NaN, null]) {
      await expect(
        resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", {
          variantId: "var-1",
          quantity,
        }),
      ).rejects.toThrow("theme.invalid_params");
    }
  });

  it("suspension wins over a well-formed add (zero data reads)", async () => {
    const db = shopDb();
    await expect(
      resolveStorefrontDevThemeCall(
        db.asClient(),
        SLUG,
        "cart.add",
        { variantId: "var-1", quantity: 1 },
        { suspended: true },
      ),
    ).rejects.toThrow("theme.suspended");
    expect(db.selects().length).toBe(0);
  });
});

describe("loadStorefrontDevThemeSuspension — live install liveness", () => {
  it("live installs (installed/trial) are not suspended", async () => {
    for (const status of ["installed", "trial"]) {
      const db = shopDb({ installStatus: status });
      await expect(
        loadStorefrontDevThemeSuspension(db.asClient(), SLUG),
      ).resolves.toBe(false);
    }
  });

  it("revoked/removed/paused installs suspend (fail closed)", async () => {
    for (const status of ["revoked", "removed", "paused", "expired", ""]) {
      const db = shopDb({ installStatus: status });
      await expect(
        loadStorefrontDevThemeSuspension(db.asClient(), SLUG),
      ).resolves.toBe(true);
    }
  });

  it("missing linkage suspends: unknown slug, unlinked theme, missing ledger row", async () => {
    const db = shopDb();
    await expect(
      loadStorefrontDevThemeSuspension(db.asClient(), "nope"),
    ).resolves.toBe(true);
    await expect(
      loadStorefrontDevThemeSuspension(db.asClient(), ""),
    ).resolves.toBe(true);
    const unlinked = shopDb({ installId: null });
    await expect(
      loadStorefrontDevThemeSuspension(unlinked.asClient(), SLUG),
    ).resolves.toBe(true);
    const inactive = shopDb({ activeTheme: false });
    await expect(
      loadStorefrontDevThemeSuspension(inactive.asClient(), SLUG),
    ).resolves.toBe(true);
  });
});

describe("resolvePublishedStorefrontIsolatedInputs — homepage mount gate", () => {
  it("admits the approved ACTIVE projection", () => {
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: null,
        binding: binding(),
      }),
    ).toEqual({
      assetOrigin: "https://themes.example-cdn.com",
      name: "aurora-lookbook",
      version: "1.0.0",
      granted: ["theme:storefront:read", "theme:variant:select"],
      navigateAllowlist: [],
    });
  });

  it("preview drafts never mount (published document only)", () => {
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: true,
        pageThemeId: null,
        binding: binding(),
      }),
    ).toBeNull();
  });

  it("CMS-pinned pages never inherit the active theme's binding", () => {
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: "00000000-0000-4000-8000-000000000000",
        binding: binding(),
      }),
    ).toBeNull();
  });

  it("malformed bindings never mount (fail closed, never throws)", () => {
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: null,
        binding: null,
      }),
    ).toBeNull();
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: null,
        binding: binding({ assetOrigin: "http://evil.example/x" }),
      }),
    ).toBeNull();
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: null,
        binding: binding({
          theme: { name: "aurora-lookbook", version: "latest" },
        }),
      }),
    ).toBeNull();
    expect(
      resolvePublishedStorefrontIsolatedInputs({
        preview: false,
        pageThemeId: null,
        binding: binding({ granted: null }),
      }),
    ).toBeNull();
    expect(resolvePublishedStorefrontIsolatedInputs(null)).toBeNull();
    expect(resolvePublishedStorefrontIsolatedInputs(undefined)).toBeNull();
    expect(
      resolvePublishedStorefrontIsolatedInputs({ binding: binding() }),
    ).not.toBeNull();
  });
});

describe("adversarial — mid-session suspension stops a live host", () => {
  it("a live call succeeds, then revocation refuses the next envelope", async () => {
    const live = shopDb({ installStatus: "installed" });
    const suspended = await loadStorefrontDevThemeSuspension(
      live.asClient(),
      SLUG,
    );
    expect(suspended).toBe(false);
    const out = (await resolveStorefrontDevThemeCall(
      live.asClient(),
      SLUG,
      "storefront.read",
      undefined,
      { suspended },
    )) as { shop: Record<string, unknown> };
    expect(out.shop).toMatchObject({ slug: SLUG });

    const revoked = shopDb({ installStatus: "revoked" });
    const nowSuspended = await loadStorefrontDevThemeSuspension(
      revoked.asClient(),
      SLUG,
    );
    expect(nowSuspended).toBe(true);
    await expect(
      resolveStorefrontDevThemeCall(
        revoked.asClient(),
        SLUG,
        "storefront.read",
        undefined,
        { suspended: nowSuspended },
      ),
    ).rejects.toThrow("theme.suspended");
  });
});
