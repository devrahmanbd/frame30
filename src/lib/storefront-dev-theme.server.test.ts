/**
 * Storefront Level B public path — TDD.
 *
 * - Projection allow/deny matrix for the PUBLISHED active theme
 *   (`loadPublishedDevThemeProjection`): approved release only; anything
 *   else yields null → the host keeps the explicit placeholder.
 * - `onCall` allow/revalidate/deny (`resolveStorefrontDevThemeCall` +
 *   `validateStorefrontDevThemeParams`): allow-listed read-only commerce
 *   methods revalidated against live rows for THIS slug's merchant;
 *   commerce writes and unknown methods deny; forbidden fields deny.
 * - Published-vs-draft isolation: draft checksums never satisfy the public
 *   loader; draft rows are never read.
 * - Tampered-release fail-closed: tampered bytes / stripped approval /
 *   checksum skew yield null.
 *
 * No network, no real database: approvals come from the real in-memory
 * review store, persistence goes through fakeDb.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import { createDevThemeReleaseStore } from "./dev-theme-review";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const {
  loadPublishedDevThemeProjection,
  resolveStorefrontDevThemeCall,
  isStorefrontDevThemeMethod,
  validateStorefrontDevThemeParams,
} = await import("./storefront-dev-theme.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const THEME_SLUG = "aurora-lookbook";
const ORIGIN = "https://themes.example-cdn.com";
const SLUG = "acme";

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const MOD = { id: "reviewer-1", role: "moderator" } as const;

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: THEME_SLUG,
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function file(path: string, text: string): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text) };
}

function bundleInput(hero = `export const h = 1;`): DevThemeBundleInput {
  const m = manifest();
  return {
    manifest: m,
    files: [
      file("dev.theme.json", JSON.stringify(m)),
      file("components/Hero.js", hero),
    ],
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  };
}

function approvedBundle(hero = `export const h = 1;`) {
  const store = createDevThemeReleaseStore();
  const v = validateDevThemeBundle(bundleInput(hero));
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  const { release: submitted } = store.submit({
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  store.review({
    releaseId: submitted.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: v.fingerprint,
    publishedAt: T1,
  });
  return { store, release, fingerprint: v.fingerprint };
}

function submittedOnly() {
  const store = createDevThemeReleaseStore();
  const v = validateDevThemeBundle(bundleInput());
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  const { release } = store.submit({
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  return { store, release, fingerprint: v.fingerprint };
}

const INSTALL_ID = "33333333-3333-4333-8333-333333333333";
const THEME_ID = "44444444-4444-4444-8444-444444444444";

function projectedDb(
  release: unknown,
  fingerprint: string,
  over?: {
    isActive?: boolean;
    sourceKey?: string | null;
    sourceInstallId?: string | null;
    versionStatus?: string;
    versionChecksum?: string;
  },
) {
  const assembled = assembleDevThemeBundle({
    manifestJson: manifest(),
    files: bundleInput().files,
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("fixture assemble refused");
  const assetName = (outPath: string) =>
    `dev-themes/${THEME_SLUG}/1.0.0/${outPath}`;
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
  const isText = (p: string) => /\.(js|mjs|cjs|css|map|json|svg)$/.test(p);
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
      ],
      product_variants: [
        {
          id: "var-1",
          product_id: "prod-1",
          name: "Default",
          price_amount_minor_int: 5000,
          stock_quantity: 3,
        },
      ],
      store_themes: [
        {
          id: THEME_ID,
          merchant_id: MERCHANT,
          name: "Aurora Lookbook",
          is_active: over?.isActive ?? true,
          published_version_id: null,
          source_listing_slug: over?.sourceKey === undefined ? THEME_SLUG : over.sourceKey,
          source_version: "1.0.0",
          source_install_id:
            over?.sourceInstallId === undefined ? INSTALL_ID : over.sourceInstallId,
        },
      ],
      theme_versions: [
        {
          id: "v1",
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          version: 1,
          status: over?.versionStatus ?? "published",
          checksum: over?.versionChecksum ?? fingerprint,
          templates: {},
          tokens: {},
        },
      ],
      theme_drafts: [],
      theme_schedules: [],
      marketplace_installs: [
        {
          id: INSTALL_ID,
          merchant_id: MERCHANT,
          kind: "theme",
          artifact_checksum: fingerprint,
          artifact_version: "1.0.0",
          artifact_pinned: `dev-theme:${(release as { id: string }).id}`,
          status: "installed",
        },
      ],
      theme_assets: [
        ...assembled.outputs.map((o) => ({
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          name: assetName(o.path),
          kind: "json",
          content: isText(o.path) ? text(o.bytes) : toB64(o.bytes),
          url: `/t/${THEME_SLUG}/1.0.0/${o.path}`,
          bytes: o.bytes.length,
          enabled: true,
        })),
        {
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          name: `dev-themes/${THEME_SLUG}/1.0.0/release.json`,
          kind: "json",
          content: assembled.releaseJson,
          url: null,
          bytes: assembled.releaseJson.length,
          enabled: true,
        },
        {
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          name: `dev-themes/${THEME_SLUG}/1.0.0/.approval.json`,
          kind: "json",
          content: JSON.stringify(release),
          url: null,
          bytes: JSON.stringify(release).length,
          enabled: true,
        },
      ],
    },
  });
}

beforeEach(() => recorder.reset());

describe("allow-list — read-only commerce, writes denied", () => {
  it("admits storefront.read, variant.select and navigate only", () => {
    expect(isStorefrontDevThemeMethod("storefront.read")).toBe(true);
    expect(isStorefrontDevThemeMethod("variant.select")).toBe(true);
    expect(isStorefrontDevThemeMethod("navigate")).toBe(true);
    expect(isStorefrontDevThemeMethod("cart.add")).toBe(false);
    expect(isStorefrontDevThemeMethod("unknown.method")).toBe(false);
    expect(isStorefrontDevThemeMethod(null)).toBe(false);
    expect(isStorefrontDevThemeMethod(undefined)).toBe(false);
  });

  it("rejects forbidden keys and malformed shapes with theme.* errors", () => {
    expect(validateStorefrontDevThemeParams("cart.add", {})).toBe("theme.denied");
    expect(validateStorefrontDevThemeParams("unknown", {})).toBe("theme.denied");
    expect(
      validateStorefrontDevThemeParams("storefront.read", { price: 1 }),
    ).toBe("theme.forbidden_field");
    expect(
      validateStorefrontDevThemeParams("variant.select", {
        variantId: "var-1",
        price: 1,
      }),
    ).toBe("theme.forbidden_field");
    expect(validateStorefrontDevThemeParams("variant.select", {})).toBe(
      "theme.invalid_params",
    );
    expect(validateStorefrontDevThemeParams("navigate", {})).toBe(
      "theme.invalid_params",
    );
    expect(
      validateStorefrontDevThemeParams("storefront.read", undefined),
    ).toBeNull();
    expect(
      validateStorefrontDevThemeParams("variant.select", { variantId: "var-1" }),
    ).toBeNull();
    expect(
      validateStorefrontDevThemeParams("navigate", { href: "/p/x" }),
    ).toBeNull();
  });
});

describe("loadPublishedDevThemeProjection — published approved release only", () => {
  it("projects the approved PUBLISHED release", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      const db = projectedDb(release, fingerprint);
      const out = await loadPublishedDevThemeProjection(db.asClient(), MERCHANT);
      expect(out).not.toBeNull();
      expect(out!.manifest.id).toBe(THEME_SLUG);
      expect(out!.binding.theme).toEqual({ name: THEME_SLUG, version: "1.0.0" });
      expect(out!.binding.fingerprint).toBe(fingerprint);
      expect(out!.binding.granted).toContain("theme:storefront:read");
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("deny matrix: inactive, unkeyed, unlinked, draft-only, or missing → null", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      expect(
        await loadPublishedDevThemeProjection(
          projectedDb(release, fingerprint, { isActive: false }).asClient(),
          MERCHANT,
        ),
      ).toBeNull();
      expect(
        await loadPublishedDevThemeProjection(
          projectedDb(release, fingerprint, { sourceKey: "" }).asClient(),
          MERCHANT,
        ),
      ).toBeNull();
      expect(
        await loadPublishedDevThemeProjection(
          projectedDb(release, fingerprint, { sourceKey: null }).asClient(),
          MERCHANT,
        ),
      ).toBeNull();
      expect(
        await loadPublishedDevThemeProjection(
          projectedDb(release, fingerprint, { sourceInstallId: null }).asClient(),
          MERCHANT,
        ),
      ).toBeNull();
      // Draft-only corroboration never satisfies the public loader.
      expect(
        await loadPublishedDevThemeProjection(
          projectedDb(release, fingerprint, { versionStatus: "draft" }).asClient(),
          MERCHANT,
        ),
      ).toBeNull();
      // No version rows at all → null.
      const empty = projectedDb(release, fingerprint);
      empty.rows("theme_versions").length = 0;
      expect(
        await loadPublishedDevThemeProjection(empty.asClient(), MERCHANT),
      ).toBeNull();
      expect(await loadPublishedDevThemeProjection(fakeDb().asClient(), MERCHANT)).toBeNull();
      expect(await loadPublishedDevThemeProjection(fakeDb().asClient(), "")).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("unapproved (in_review) releases never project to shoppers", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = submittedOnly();
      const db = projectedDb(release, fingerprint);
      expect(
        await loadPublishedDevThemeProjection(db.asClient(), MERCHANT),
      ).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("tampered bytes, stripped approval, or checksum skew fail closed", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      const skewed = projectedDb(release, fingerprint, {
        versionChecksum: "c".repeat(64),
      });
      expect(
        await loadPublishedDevThemeProjection(skewed.asClient(), MERCHANT),
      ).toBeNull();
      const tampered = projectedDb(release, fingerprint);
      const manifestRow = tampered
        .rows("theme_assets")
        .find((r) => String(r.name).endsWith("dev.theme.json"))!;
      manifestRow.content = String(manifestRow.content).replace(
        "Aurora Lookbook",
        "Evil Lookbook",
      );
      expect(
        await loadPublishedDevThemeProjection(tampered.asClient(), MERCHANT),
      ).toBeNull();
      const stripped = projectedDb(release, fingerprint);
      const approvalRow = stripped
        .rows("theme_assets")
        .find((r) => String(r.name).endsWith(".approval.json"))!;
      approvalRow.content = JSON.stringify({ ...release, reviews: [] });
      expect(
        await loadPublishedDevThemeProjection(stripped.asClient(), MERCHANT),
      ).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("never reads draft rows on the public path", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      const db = projectedDb(release, fingerprint);
      db.rows("theme_drafts").push({
        theme_id: THEME_ID,
        templates: { evil: true },
        tokens: {},
        revision: 99,
        updated_at: T1,
      });
      const out = await loadPublishedDevThemeProjection(db.asClient(), MERCHANT);
      expect(out).not.toBeNull();
      expect(db.selects("theme_drafts").length).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });
});

describe("resolveStorefrontDevThemeCall — allow, revalidate, deny", () => {
  function shopDb() {
    return fakeDb({
      tables: {
        merchants: [
          { id: MERCHANT, name: "Acme", slug: SLUG, currency_code: "BDT", status: "active" },
          { id: "other", name: "Other", slug: "other", currency_code: "BDT", status: "active" },
        ],
        products: [
          { id: "prod-1", merchant_id: MERCHANT, title: "Jamdani", slug: "jamdani", status: "active", created_at: T1 },
          { id: "prod-9", merchant_id: "other", title: "Foreign", slug: "foreign", status: "active", created_at: T1 },
        ],
        product_variants: [
          { id: "var-1", product_id: "prod-1", name: "Default", price_amount_minor_int: 5000, stock_quantity: 3 },
          { id: "var-9", product_id: "prod-9", name: "Foreign", price_amount_minor_int: 9999, stock_quantity: 9 },
        ],
      },
    });
  }

  it("storefront.read returns public shop + catalog for THIS slug, never PII", async () => {
    const db = shopDb();
    const out = (await resolveStorefrontDevThemeCall(
      db.asClient(),
      SLUG,
      "storefront.read",
      undefined,
    )) as { shop: Record<string, unknown>; products: unknown[] };
    expect(out.shop).toEqual({ name: "Acme", slug: SLUG, currency: "BDT" });
    expect(out.products).toEqual([{ id: "prod-1", title: "Jamdani", slug: "jamdani" }]);
    expect(JSON.stringify(out)).not.toMatch(/customer|order|secret|token/i);
  });

  it("variant.select revalidates price/stock from live rows; cross-tenant ids fail closed", async () => {
    const db = shopDb();
    const hit = (await resolveStorefrontDevThemeCall(
      db.asClient(),
      SLUG,
      "variant.select",
      { variantId: "var-1" },
    )) as { variant: Record<string, unknown> };
    expect(hit.variant).toMatchObject({ id: "var-1", priceMinor: 5000, inStock: true });
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "variant.select", { variantId: "var-9" }),
    ).rejects.toThrow("theme.not_found");
    const byProduct = (await resolveStorefrontDevThemeCall(
      db.asClient(),
      SLUG,
      "variant.select",
      { productId: "prod-1" },
    )) as { variants: { priceMinor: number }[] };
    expect(byProduct.variants[0]!.priceMinor).toBe(5000);
  });

  it("navigate allows same-store paths and denies the rest", async () => {
    const db = shopDb();
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "navigate", { href: "/p/jamdani" }),
    ).resolves.toEqual({ allowed: true });
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "navigate", { href: "javascript:alert(1)" }),
    ).rejects.toThrow("theme.navigation_denied");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "navigate", { href: "https://evil.example/x" }),
    ).rejects.toThrow("theme.navigation_denied");
  });

  it("commerce writes, unknown methods, forbidden fields, and unknown stores deny", async () => {
    const db = shopDb();
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "cart.add", { variantId: "var-1", quantity: 1 }),
    ).rejects.toThrow("theme.denied");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "unknown.method", {}),
    ).rejects.toThrow("theme.denied");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "storefront.read", { price: 1 }),
    ).rejects.toThrow("theme.forbidden_field");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "variant.select", { variantId: "var-1", tenantId: MERCHANT }),
    ).rejects.toThrow("theme.forbidden_field");
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), "nope", "storefront.read", undefined),
    ).rejects.toThrow("theme.denied");
  });

  it("kill switch denies every bridge call without touching the database", async () => {
    const db = shopDb();
    for (const [method, params] of [
      ["storefront.read", undefined],
      ["variant.select", { variantId: "var-1" }],
      ["navigate", { href: "/p/jamdani" }],
      ["cart.add", { variantId: "var-1", quantity: 1 }],
    ] as const) {
      await expect(
        resolveStorefrontDevThemeCall(db.asClient(), SLUG, method, params, {
          suspended: true,
        }),
      ).rejects.toThrow("theme.suspended");
    }
    // No merchant, catalog, or variant row was read: suspension is decided
    // before the first query, so a revoked install costs zero data access.
    expect(db.selects().length).toBe(0);
  });

  it("suspension wins over malformed stores and forged params alike", async () => {
    const db = shopDb();
    await expect(
      resolveStorefrontDevThemeCall(
        db.asClient(),
        "",
        "storefront.read",
        undefined,
        {
          suspended: true,
        },
      ),
    ).rejects.toThrow("theme.suspended");
    await expect(
      resolveStorefrontDevThemeCall(
        db.asClient(),
        SLUG,
        "storefront.read",
        { price: 1 },
        { suspended: true },
      ),
    ).rejects.toThrow("theme.suspended");
    expect(db.selects().length).toBe(0);
  });

  it("tenant smuggling via merchant params is forgery, never a tenant switch", async () => {
    const db = shopDb();
    // merchantId / merchant_id / merchant ride the same forbidden table as
    // tenantId: the slug owns the tenant, params never do.
    for (const params of [
      { merchantId: "other" },
      { merchant_id: "other" },
      { merchant: "other" },
    ]) {
      await expect(
        resolveStorefrontDevThemeCall(
          db.asClient(),
          SLUG,
          "storefront.read",
          params,
        ),
      ).rejects.toThrow("theme.forbidden_field");
      await expect(
        resolveStorefrontDevThemeCall(db.asClient(), SLUG, "variant.select", {
          variantId: "var-1",
          ...params,
        }),
      ).rejects.toThrow("theme.forbidden_field");
    }
    // And without smuggled keys the slug still scopes to ITS merchant only:
    // cross-tenant variant ids fail closed even when well-formed.
    await expect(
      resolveStorefrontDevThemeCall(db.asClient(), SLUG, "variant.select", {
        variantId: "var-9",
      }),
    ).rejects.toThrow("theme.not_found");
  });
});
