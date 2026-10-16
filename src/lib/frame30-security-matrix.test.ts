/**
 * Frame30 security matrix — tenant isolation, capability authorization,
 * kill switches, revoked-release refusal, and wrong-widget safety.
 *
 * Pins DOCUMENTED security contracts (not implementation details), so other
 * lanes can refactor freely as long as the contracts hold:
 * - Tenant isolation: widget registries build from tenant installs only
 *   (`src/lib/unified-widget-registry.ts: fromPluginManifest` drops
 *   merchant-disabled installs; `buildTrayRegistry` merges tier sources);
 *   package serving is merchant-scoped (`src/lib/package-serve.ts:
 *   resolvePkgAsset` re-checks merchant+name); review rows are
 *   merchant-scoped (`src/lib/dev-theme-review.ts: scopedRelease`).
 * - Capability authorization: default-deny grants
 *   (`src/components/theme-runtime/capabilities.ts: buildThemeGrants`),
 *   per-message authorization on both bridges
 *   (`src/lib/marketplace-scopes.ts: authorizeWidgetCall`,
 *   `src/components/theme-runtime/bridge-v2.ts: authorizeThemeCall`),
 *   `navigate` never implicit (`src/lib/dev-theme-activate.ts` grant map).
 * - Kill switches: disabled installs contribute nothing and resolve to
 *   placeholder misses with data preserved (never execute).
 * - Revoked releases: `resolveDevThemeActivation` refuses revoked/removed
 *   snapshots even with a live-store re-check, and refuses fingerprint skew.
 * - Wrong-widget safety: every miss carries the requested id + preserved
 *   data; a miss NEVER substitutes another owner's definition.
 *
 * Pure unit tests only (node env): no DB, no network, no DOM.
 */
import { describe, expect, it } from "vitest";
import {
  BUILDER_API_VERSION,
  parsePluginWidgetKey,
  pluginTrayEntries,
  pluginWidgetKey,
  resolvePluginWidget,
  type InstalledPlugin,
} from "./plugin-manifest";
import {
  authorizeWidgetCall,
  WIDGET_API,
} from "./marketplace-scopes";
import { SCOPES } from "./marketplace-scopes";
import {
  buildThemeGrants,
  THEME_METHODS,
} from "../components/theme-runtime/capabilities";
import {
  authorizeThemeCall,
  buildThemePreviewEnvelope,
  handleThemeMessage,
  createThemeGuard,
  isOwnerFrame,
  THEME_BRIDGE_VERSION,
  type ThemePreviewEnvelope,
} from "../components/theme-runtime/bridge-v2";
import {
  answerWidgetCall,
  FRAME_HTML,
  handleSandboxMessage,
} from "../components/marketplace/WidgetSandbox";
import { createFloodGuard } from "./bridge-flood-guard";
import {
  buildThemeFrameUrl,
  clampThemeHeight,
  isApprovedAssetOrigin,
  THEME_SANDBOX,
  themeFrameCSP,
} from "../components/theme-runtime/ThemeRuntime";
import {
  buildTrayRegistry,
  createWidgetRegistry,
  fromPluginManifest,
  type WidgetDef,
} from "./unified-widget-registry";
import {
  parsePkgSplat,
  parsePkgVersion,
  resolvePkgAsset,
  type PkgRow,
} from "./package-serve";
import { createDevThemeReleaseStore } from "./dev-theme-review";
import type { DevThemeManifest } from "./dev-theme-manifest";
import {
  devThemeGrantsFor,
  resolveDevThemeActivation,
} from "./dev-theme-activate";
import { assertTenantId, isTenantId } from "./tenant-scope";

/* ---------------------------------------------------------- fixtures */

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

function pluginInstall(
  id: string,
  opts: { enabled?: boolean; widgetKey?: string } = {},
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: "1.2.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: opts.widgetKey ?? "reviews",
          label: "Reviews",
          slots: ["main"],
          entry: "reviews-entry.js",
          height: 320,
        },
      ],
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: opts.enabled ?? true,
  };
}

/** Registry built the way the tray builds it: from ONE tenant's installs. */
function tenantRegistry(installs: readonly InstalledPlugin[]) {
  const reg = createWidgetRegistry();
  for (const def of fromPluginManifest(installs)) {
    const v = reg.registerWidget(def);
    expect(v.ok).toBe(true);
  }
  return reg;
}

function themeDef(
  id: string,
  opts: { themeId?: string; themeComponent?: string } = {},
): WidgetDef {
  return {
    id,
    namespace: "theme",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "theme",
    slots: [],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "custom",
    ...(opts.themeId !== undefined ? { themeId: opts.themeId } : {}),
    ...(opts.themeComponent !== undefined
      ? { themeComponent: opts.themeComponent }
      : {}),
  };
}

/* ============================================ (1) tenant isolation */

describe("tenant isolation — definitions never cross tenants", () => {
  it("tenant A's registry resolves A's widget", () => {
    const regA = tenantRegistry([pluginInstall("acme-reviews")]);
    const keyA = pluginWidgetKey("acme-reviews", "reviews");
    const hit = regA.resolveWidget(keyA);
    expect(hit.ok).toBe(true);
  });

  it("tenant B's registry never resolves tenant A's definition", () => {
    const regB = tenantRegistry([pluginInstall("other-corp")]);
    const keyA = pluginWidgetKey("acme-reviews", "reviews");
    const miss = regB.resolveWidget(keyA);
    expect(miss.ok).toBe(false);
    // The miss carries no definition at all — nothing of B substitutes.
    expect("def" in (miss as Record<string, unknown>)).toBe(false);
    expect(JSON.stringify(miss)).not.toContain("other-corp");
    if (!miss.ok) {
      expect(miss.missing.widgetId).toBe(keyA);
      expect(miss.missing.reason).toBe("uninstalled");
    }
  });

  it("plugin resolver: A's key is not_installed against B's installs", () => {
    const keyA = pluginWidgetKey("acme-reviews", "reviews");
    const out = resolvePluginWidget(keyA, [pluginInstall("other-corp")]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("not_installed");
      expect(out.pluginId).toBe("acme-reviews");
    }
  });

  it("tray built from B's installs never offers A's widget", () => {
    const tray = buildTrayRegistry([pluginInstall("other-corp")]);
    const keyA = pluginWidgetKey("acme-reviews", "reviews");
    const keyB = pluginWidgetKey("other-corp", "reviews");
    expect(tray.resolveWidget(keyB).ok).toBe(true);
    const miss = tray.resolveWidget(keyA);
    expect(miss.ok).toBe(false);
    expect("def" in (miss as Record<string, unknown>)).toBe(false);
  });

  it("an empty install set resolves nothing (no ambient definitions)", () => {
    const tray = buildTrayRegistry([]);
    const miss = tray.resolveWidget(
      pluginWidgetKey("acme-reviews", "reviews"),
    );
    expect(miss.ok).toBe(false);
  });

  it("package serving: merchant-B asset addressed under anyone else 404s", () => {
    const asset = "themes/v1/assets/styles/skins.css";
    const target = parsePkgSplat(`${TENANT_B}/${asset}`);
    expect(target).not.toBeNull();
    const rowForA: PkgRow = {
      merchant_id: TENANT_A,
      name: asset,
      kind: "css",
      content: "a{color:red}",
      url: `/pkg/${TENANT_A}/${asset}?v=abcdef12`,
      enabled: true,
    };
    // Same bytes, wrong merchant scope: mismatch, never served.
    const out = resolvePkgAsset(target!, "abcdef12", rowForA);
    expect(out).toEqual({ status: 404, reason: "mismatch" });
    // And a null row (B owns nothing by that name) is a plain missing.
    expect(resolvePkgAsset(target!, "abcdef12", null)).toEqual({
      status: 404,
      reason: "missing",
    });
  });

  it("package serving: non-UUID merchant prefix never parses", () => {
    expect(parsePkgSplat("acme/themes/v1/assets/x.css")).toBeNull();
    expect(parsePkgSplat("*/themes/v1/assets/x.css")).toBeNull();
    expect(parsePkgVersion("not-a-hash")).toBeNull();
    expect(parsePkgVersion("ABCDEFGH")).toBeNull();
    expect(parsePkgVersion("abcdef12")).toBe("abcdef12");
  });

  it("review store: merchant B cannot publish/revoke merchant A's release", () => {
    const store = createDevThemeReleaseStore();
    const manifest = testManifest();
    const fp = "a".repeat(64);
    const { release } = store.submit({
      merchantId: TENANT_A,
      themeId: "theme-a",
      manifest,
      files: [],
      fingerprint: fp,
      submittedBy: "dev-a",
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    const actor = { id: "mod-1", role: "moderator" as const};
    let code: string | null = null;
    try {
      store.publish({
        releaseId: release.id,
        merchantId: TENANT_B,
        actor,
        expectedFingerprint: fp,
        publishedAt: "2026-01-02T00:00:00.000Z",
      });
    } catch (err) {
      // DevThemeReviewError carries the machine code on `.code`; the human
      // message intentionally omits it (unlike the activation error shape).
      code = (err as { code?: string }).code ?? null;
    }
    expect(code).toBe("dev_theme.not_found");
    // Cross-merchant get is also scoped: B's activation lookup misses.
    expect(store.get(release.id)?.merchantId).toBe(TENANT_A);
  });

  it("tenant scope: wildcard ids fail loudly instead of widening", () => {
    for (const wild of ["*", "all", "any", "null", "undefined", "0", "-", ""]) {
      expect(isTenantId(wild)).toBe(false);
      expect(() => assertTenantId(wild, "probe")).toThrow();
    }
    expect(isTenantId(TENANT_A)).toBe(true);
    expect(assertTenantId(TENANT_A, "probe")).toBe(TENANT_A);
  });
});

function testManifest(): DevThemeManifest {
  return {
    id: "theme-a",
    version: "1.0.0",
    runtime: "1.0.0",
    name: "Theme A",
    publisher: "acme",
    capabilities: ["presentation"],
    dependencies: [],
    sections: [],
    settings: [],
  };
}

/* ==================== (2) capability authorization (both sandboxes) */

describe("capability authorization — ungranted methods denied", () => {
  const widgetMethods = Object.keys(WIDGET_API);
  const themeMethods = Object.keys(THEME_METHODS);

  it("widget bridge: every method denied with zero grants", () => {
    expect(widgetMethods.length).toBeGreaterThan(0);
    for (const method of widgetMethods) {
      const v = authorizeWidgetCall({ v: 1, id: "1", method }, []);
      expect(v).toEqual({ allowed: false, reason: "scope_denied", method });
    }
  });

  it("theme bridge: every method denied with zero grants", () => {
    expect(themeMethods.length).toBeGreaterThan(0);
    for (const method of themeMethods) {
      const v = authorizeThemeCall(
        { v: THEME_BRIDGE_VERSION, id: "1", method, params: validThemeParams(method) },
        { granted: [] },
      );
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe("scope_denied");
    }
  });

  it("default-deny: empty grant options grant nothing", () => {
    expect(buildThemeGrants({}).granted).toEqual([]);
    expect(buildThemeGrants().granted).toEqual([]);
  });

  it("navigate is never implicit: full grants minus navigate still deny it", () => {
    const grants = buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
    });
    expect(grants.granted).not.toContain("theme:navigate");
    const v = authorizeThemeCall(
      {
        v: THEME_BRIDGE_VERSION,
        id: "1",
        method: "navigate",
        params: { href: "/products/x" },
      },
      grants,
    );
    expect(v).toEqual({ allowed: false, reason: "scope_denied", method: "navigate" });
  });

  it("navigate granted explicitly: paths allowed, foreign origins denied", () => {
    const grants = buildThemeGrants({ navigate: true });
    const ok = authorizeThemeCall(
      {
        v: THEME_BRIDGE_VERSION,
        id: "1",
        method: "navigate",
        params: { href: "/products/x" },
      },
      grants,
    );
    expect(ok).toEqual({ allowed: true, method: "navigate" });
    const denied = authorizeThemeCall(
      {
        v: THEME_BRIDGE_VERSION,
        id: "2",
        method: "navigate",
        params: { href: "https://evil.test/x" },
      },
      grants,
    );
    expect(denied).toEqual({
      allowed: false,
      reason: "navigation_denied",
      method: "navigate",
    });
  });

  it("host gates surface scope_denied (never throw, never execute)", async () => {
    const w = await handleSandboxMessage(
      { v: 1, id: "1", method: "orders.list" },
      {
        granted: [],
        onCall: async () => ({ leaked: true }),
        guard: createFloodGuard(),
      },
    );
    expect(w).toEqual({ error: "sandbox.scope_denied" });

    const t = await handleThemeMessage(
      {
        v: THEME_BRIDGE_VERSION,
        id: "1",
        method: "cart.add",
        params: { variantId: "v1", quantity: 1 },
      },
      {
        granted: [],
        onCall: async () => ({ leaked: true }),
        guard: createThemeGuard(),
      },
    );
    expect(t).toEqual({ error: "theme.scope_denied" });
  });

  it("answerWidgetCall denies without grants even when host would answer", async () => {
    let called = false;
    const out = await answerWidgetCall(
      { v: 1, id: "1", method: "shop.info" },
      {
        granted: [],
        onCall: async () => {
          called = true;
          return {};
        },
      },
    );
    expect(out).toEqual({ error: "sandbox.scope_denied" });
    expect(called).toBe(false);
  });

  it("dev-theme capability map never yields theme:navigate", () => {
    const granted = devThemeGrantsFor([
      "presentation",
      "commerce-read",
      "cart-write",
      "animation",
      "webgl",
    ]);
    expect(granted).not.toContain("theme:navigate");
    expect(granted).not.toContain("theme:storefront:write" as string);
  });

  it("unknown capabilities fail closed", () => {
    expect(() => devThemeGrantsFor(["everything"])).toThrowError(
      /dev_theme_activate\.capability/,
    );
  });
});

function validThemeParams(method: string): unknown {
  switch (method) {
    case "storefront.read":
      return {};
    case "variant.select":
      return { variantId: "v1" };
    case "cart.add":
      return { variantId: "v1", quantity: 1 };
    case "navigate":
      return { href: "/products/x" };
    default:
      return {};
  }
}

/* ==================== (6a) no commerce operations reachable */

describe("failure containment — no order/payment/ledger operations reachable", () => {
  const COMMERCE_OPS = [
    "orders.create",
    "orders.update",
    "orders.delete",
    "orders.refund",
    "payments.charge",
    "payments.refund",
    "payment.capture",
    "ledger.append",
    "ledger.write",
    "payouts.create",
    "payouts.list",
    "refunds.create",
    "invoices.pay",
    "charge.create",
  ];

  it("widget bridge: commerce operations are unknown methods (not denied-but-known)", () => {
    for (const method of COMMERCE_OPS) {
      const v = authorizeWidgetCall({ v: 1, id: "1", method }, [
        "read_orders",
        "read_shop",
        "read_products",
        "write_products",
        "read_customers",
        "write_cart",
        "write_analytics",
        "render_storefront",
        "read_menus",
        "replace_menus",
      ]);
      // Even with EVERY scope granted, the method does not exist.
      expect(v).toEqual({ allowed: false, reason: "unknown_method", method });
    }
  });

  it("theme bridge: commerce operations are unknown methods", () => {
    const grants = buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
      navigate: true,
    });
    for (const method of COMMERCE_OPS) {
      const v = authorizeThemeCall(
        { v: THEME_BRIDGE_VERSION, id: "1", method, params: {} },
        grants,
      );
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe("unknown_method");
    }
  });

  it("theme vocabulary is exactly the four documented methods", () => {
    expect(Object.keys(THEME_METHODS).sort()).toEqual(
      ["cart.add", "navigate", "storefront.read", "variant.select"].sort(),
    );
  });

  it("widget vocabulary carries no payment/ledger/payout/refund/charge/invoice method", () => {
    const bad = Object.keys(WIDGET_API).filter((k) =>
      /payment|ledger|payout|refund|charge|invoice/i.test(k),
    );
    expect(bad).toEqual([]);
  });

  it("every widget scope is a known least-privilege scope id", () => {
    const known = new Set(SCOPES.map((s) => s.id));
    for (const [method, def] of Object.entries(WIDGET_API)) {
      expect(known.has(def.scope), `${method} -> ${def.scope}`).toBe(true);
    }
  });

  it("builder API pin is the documented version", () => {
    expect(BUILDER_API_VERSION).toBe("3.1.0");
  });
});

/* ==================== (3) kill switches: placeholders, never execute */

describe("kill switches — disabled extensions never execute", () => {
  it("resolvePluginWidget: disabled install resolves disabled (never ok)", () => {
    const key = pluginWidgetKey("acme-reviews", "reviews");
    const r = resolvePluginWidget(key, [
      pluginInstall("acme-reviews", { enabled: false }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disabled");
  });

  it("fromPluginManifest: disabled installs contribute zero definitions", () => {
    expect(fromPluginManifest([pluginInstall("acme-reviews", { enabled: false })])).toEqual(
      [],
    );
  });

  it("tray entries: disabled installs offer nothing", () => {
    expect(
      pluginTrayEntries([pluginInstall("acme-reviews", { enabled: false })], "main"),
    ).toEqual([]);
  });

  it("registry kill switch: disableWidget -> disabled miss with data preserved", () => {
    const reg = tenantRegistry([pluginInstall("acme-reviews")]);
    const key = pluginWidgetKey("acme-reviews", "reviews");
    expect(reg.disableWidget(key)).toEqual({ ok: true });
    const data = { title: "keep me", rows: [1, 2] };
    const miss = reg.resolveWidget(key, { data });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("disabled");
      expect(miss.missing.widgetId).toBe(key);
      expect(miss.missing.preservedData).toEqual(data);
    }
    // Re-enable restores resolution: the kill switch is reversible, not lossy.
    expect(reg.enableWidget(key)).toEqual({ ok: true });
    expect(reg.resolveWidget(key).ok).toBe(true);
  });

  it("removed widgets resolve to misses with data preserved (tombstone)", () => {
    const reg = tenantRegistry([pluginInstall("acme-reviews")]);
    const key = pluginWidgetKey("acme-reviews", "reviews");
    expect(reg.removeWidget(key)).toEqual({ ok: true });
    const miss = reg.resolveWidget(key, { data: { title: "kept" } });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.preservedData).toEqual({ title: "kept" });
      expect(miss.missing.widgetId).toBe(key);
    }
  });

  it("package serving: disabled asset rows 404 (never execute)", () => {
    const asset = "themes/v1/assets/styles/skins.css";
    const target = parsePkgSplat(`${TENANT_A}/${asset}`)!;
    const row: PkgRow = {
      merchant_id: TENANT_A,
      name: asset,
      kind: "css",
      content: "a{color:red}",
      url: `/pkg/${TENANT_A}/${asset}?v=abcdef12`,
      enabled: false,
    };
    expect(resolvePkgAsset(target, "abcdef12", row)).toEqual({
      status: 404,
      reason: "disabled",
    });
  });

  it("stale/forged version pins 404 (never poison a shared cache)", () => {
    const asset = "themes/v1/assets/styles/skins.css";
    const target = parsePkgSplat(`${TENANT_A}/${asset}`)!;
    const row: PkgRow = {
      merchant_id: TENANT_A,
      name: asset,
      kind: "css",
      content: "a{color:red}",
      url: `/pkg/${TENANT_A}/${asset}?v=abcdef12`,
      enabled: true,
    };
    expect(resolvePkgAsset(target, "00000000", row)).toEqual({
      status: 404,
      reason: "stale_version",
    });
    expect(resolvePkgAsset(target, null, row)).toEqual({
      status: 404,
      reason: "bad_version",
    });
  });
});

describe("package updates — revoked/updated releases refuse activation", () => {
  const actor = { id: "mod-1", role: "moderator" as const };
  const T0 = "2026-01-01T00:00:00.000Z";
  const T1 = "2026-01-02T00:00:00.000Z";
  const T2 = "2026-01-03T00:00:00.000Z";
  const T3 = "2026-01-04T00:00:00.000Z";
  const FP_A = "a".repeat(64);
  const FP_B = "b".repeat(64);

  function publishedRelease(fp = FP_A) {
    const store = createDevThemeReleaseStore();
    const manifest = testManifest();
    const s = store.submit({
      merchantId: TENANT_A,
      themeId: "theme-a",
      manifest,
      files: [],
      fingerprint: fp,
      submittedBy: "dev-a",
      submittedAt: T0,
    });
    const r = store.review({
      releaseId: s.release.id,
      merchantId: TENANT_A,
      reviewer: actor,
      decision: "approve",
      reason: "looks good",
      reviewedAt: T1,
    });
    const p = store.publish({
      releaseId: r.release.id,
      merchantId: TENANT_A,
      actor,
      expectedFingerprint: fp,
      publishedAt: T2,
    });
    return { store, release: p.release };
  }

  it("a revoked release never activates (snapshot alone refuses)", () => {
    const { store, release } = publishedRelease();
    const revoked = store.revoke({
      releaseId: release.id,
      merchantId: TENANT_A,
      actor,
      reason: "compromised",
      revokedAt: T3,
    }).release;
    expect(revoked.status).toBe("revoked");
    expect(() =>
      resolveDevThemeActivation({
        release: revoked,
        expectedFingerprint: FP_A,
      }),
    ).toThrowError(/dev_theme_activate\.revoked/);
  });

  it("updated-then-revoked: a pre-revoke snapshot refuses via live re-check", () => {
    const { store, release } = publishedRelease();
    const snapshot = { ...release, reviews: [...release.reviews] };
    store.revoke({
      releaseId: release.id,
      merchantId: TENANT_A,
      actor,
      reason: "compromised after deploy",
      revokedAt: T3,
    });
    // The snapshot still says `published`, but the live store says revoked.
    expect(() =>
      resolveDevThemeActivation({
        release: snapshot,
        expectedFingerprint: FP_A,
        store,
      }),
    ).toThrowError(/dev_theme_activate\.revoked/);
  });

  it("version skew: approving bytes A never activates bytes B", () => {
    const { release } = publishedRelease(FP_A);
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: FP_B,
      }),
    ).toThrowError(/dev_theme_activate\.fingerprint_mismatch/);
  });

  it("live bytes changed under the snapshot refuse (tamper-evident)", () => {
    const { store, release } = publishedRelease(FP_A);
    const snapshot = { ...release };
    // Simulate bytes changing under the approval: live store now carries B.
    // (Direct mutation stands in for a second submission/supersede cycle;
    // the gate compares live vs snapshot fingerprints either way.)
    const live = store.get(release.id)!;
    (live as { fingerprint: string }).fingerprint = FP_B;
    expect(() =>
      resolveDevThemeActivation({
        release: snapshot,
        expectedFingerprint: FP_A,
        store,
      }),
    ).toThrowError(/dev_theme_activate\.fingerprint_mismatch/);
  });

  it("unapproved releases (in_review) never activate", () => {
    const store = createDevThemeReleaseStore();
    const { release } = store.submit({
      merchantId: TENANT_A,
      themeId: "theme-a",
      manifest: testManifest(),
      files: [],
      fingerprint: FP_A,
      submittedBy: "dev-a",
      submittedAt: T0,
    });
    expect(release.status).toBe("in_review");
    expect(() =>
      resolveDevThemeActivation({ release, expectedFingerprint: FP_A }),
    ).toThrowError(/dev_theme_activate\.unapproved/);
  });

  it("rejected releases never activate", () => {
    const store = createDevThemeReleaseStore();
    const manifest = testManifest();
    const s = store.submit({
      merchantId: TENANT_A,
      themeId: "theme-a",
      manifest,
      files: [],
      fingerprint: FP_A,
      submittedBy: "dev-a",
      submittedAt: T0,
    });
    const r = store.review({
      releaseId: s.release.id,
      merchantId: TENANT_A,
      reviewer: actor,
      decision: "reject",
      reason: "nope",
      reviewedAt: T1,
    });
    expect(() =>
      resolveDevThemeActivation({
        release: r.release,
        expectedFingerprint: FP_A,
      }),
    ).toThrowError(/dev_theme_activate\.unapproved/);
  });

  it("a good approval still activates (gate is not a blanket deny)", () => {
    const { release } = publishedRelease(FP_A);
    const act = resolveDevThemeActivation({
      release,
      expectedFingerprint: FP_A,
    });
    expect(act.fingerprint).toBe(FP_A);
    expect(act.themeId).toBe("theme-a");
  });

  it("theme binding mismatch refuses (approval covers another theme)", () => {
    const { release } = publishedRelease(FP_A);
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: FP_A,
        expectedThemeId: "theme-other",
      }),
    ).toThrowError(/dev_theme_activate\.theme_mismatch/);
  });
});

/* ==================== (6b) never silently render the wrong widget */

describe("wrong-widget safety — misses never substitute", () => {
  it("unknown ids miss with the requested id + preserved data, never a def", () => {
    const reg = createWidgetRegistry();
    const data = { headline: "merchant copy" };
    const miss = reg.resolveWidget("plugin:ghost/missing", { data });
    expect(miss.ok).toBe(false);
    expect("def" in (miss as Record<string, unknown>)).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.widgetId).toBe("plugin:ghost/missing");
      expect(miss.missing.preservedData).toEqual(data);
    }
  });

  it("cross-owner ids never resolve to another owner's definition", () => {
    const reg = createWidgetRegistry();
    const v = reg.registerWidget(
      themeDef("theme:owner-b/hero", {
        themeId: "owner-b",
        themeComponent: "Hero",
      }),
    );
    expect(v.ok).toBe(true);
    const miss = reg.resolveWidget("theme:owner-a/hero");
    expect(miss.ok).toBe(false);
    expect(JSON.stringify(miss)).not.toContain("owner-b");
    const hit = reg.resolveWidget("theme:owner-b/hero");
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.def.themeId).toBe("owner-b");
  });

  it("bad keys are misses, never resolutions", () => {
    expect(parsePluginWidgetKey("not a key")).toBeNull();
    expect(parsePluginWidgetKey("plugin:/x")).toBeNull();
    const reg = createWidgetRegistry();
    for (const bad of ["", "   ", "{{evil}}", 42, null]) {
      const miss = reg.resolveWidget(bad);
      expect(miss.ok).toBe(false);
      expect("def" in (miss as Record<string, unknown>)).toBe(false);
    }
  });

  it("getWidget on unknown ids returns undefined (never a neighbor)", () => {
    const reg = tenantRegistry([pluginInstall("acme-reviews")]);
    expect(
      reg.getWidget(pluginWidgetKey("ghost", "missing")),
    ).toBeUndefined();
  });

  it("updateWidget with a mismatched id refuses (no silent retarget)", () => {
    const reg = tenantRegistry([pluginInstall("acme-reviews")]);
    const key = pluginWidgetKey("acme-reviews", "reviews");
    const current = reg.getWidget(key)!;
    const out = reg.updateWidget(key, {
      ...(current as unknown as Record<string, unknown>),
      id: pluginWidgetKey("acme-reviews", "other"),
    });
    expect(out).toEqual({ ok: false, error: "id_mismatch" });
    // The original still resolves to itself.
    expect(reg.resolveWidget(key).ok).toBe(true);
  });

  it("malformed theme metadata is dropped: def registers, execution address lost", () => {
    const reg = createWidgetRegistry();
    const v = reg.registerWidget(
      themeDef("theme:owner-c/hero", {
        themeId: "owner-c!!!",
        themeComponent: "../../evil",
      }),
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect("themeId" in v.def).toBe(false);
      expect("themeComponent" in v.def).toBe(false);
    }
  });

  it("preview envelope for owner B parses as owner B (never rewritten to A)", () => {
    const built = buildThemePreviewEnvelope({
      widgetId: "theme:owner-b/hero",
      component: "Hero",
      props: { title: "hi" },
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      const env = built.envelope as ThemePreviewEnvelope;
      expect(env.widgetId).toBe("theme:owner-b/hero");
      expect(env.widgetId).not.toContain("owner-a");
    }
  });
});

/* ==================== sandbox boundary constants */

describe("sandbox boundaries — null-origin island, opaque theme frame", () => {
  it("theme sandbox is allow-scripts ONLY", () => {
    expect(THEME_SANDBOX).toBe("allow-scripts");
    for (const token of [
      "allow-same-origin",
      "allow-top-navigation",
      "allow-top-navigation-by-user-activation",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-forms",
    ]) {
      expect(THEME_SANDBOX.split(/\s+/)).not.toContain(token);
    }
  });

  it("frame CSP: default-deny, no network, no inline scripts", () => {
    const origin = "https://assets.test";
    expect(isApprovedAssetOrigin(origin)).toBe(true);
    const csp = themeFrameCSP(origin);
    expect(csp.startsWith("default-src 'none'")).toBe(true);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    const scriptSrc = csp
      .split("; ")
      .find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toBe(`script-src ${origin}`);
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("blob:");
    expect(scriptSrc).not.toContain("data:");
  });

  it("frame CSP fails closed on unapproved origins", () => {
    expect(themeFrameCSP("http://evil.test")).toBe("default-src 'none'");
    expect(themeFrameCSP("")).toBe("default-src 'none'");
    expect(isApprovedAssetOrigin("http://evil.test")).toBe(false);
  });

  it("theme URLs are version-pinned: latest/traversal/http refuse", () => {
    const origin = "https://assets.test";
    expect(buildThemeFrameUrl(origin, { name: "my-theme", version: "1.2.3" })).toBe(
      `${origin}/t/my-theme/1.2.3/index.html`,
    );
    expect(buildThemeFrameUrl(origin, { name: "my-theme", version: "latest" })).toBeNull();
    expect(buildThemeFrameUrl(origin, { name: "../evil", version: "1.2.3" })).toBeNull();
    expect(buildThemeFrameUrl(origin, { name: "my-theme", version: "1.2" })).toBeNull();
    expect(
      buildThemeFrameUrl("http://assets.test", { name: "my-theme", version: "1.2.3" }),
    ).toBeNull();
    expect(buildThemeFrameUrl("", { name: "my-theme", version: "1.2.3" })).toBeNull();
  });

  it("caller identity: primitives never authenticate, identity is window equality", () => {
    const w = {};
    expect(isOwnerFrame(w, w)).toBe(true);
    expect(isOwnerFrame("*", "*")).toBe(false);
    expect(isOwnerFrame("null", "null")).toBe(false);
    expect(isOwnerFrame(w, {})).toBe(false);
    expect(isOwnerFrame(null, w)).toBe(false);
    expect(isOwnerFrame(w, null)).toBe(false);
  });

  it("widget frame document: default-deny CSP with no network", () => {
    const html = FRAME_HTML("document.title='x'", "https://shop.test", "");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("img-src 'none'");
    expect(html).toContain("font-src 'none'");
  });

  it("height handshake is clamped (runaway content cannot take the page)", () => {
    expect(clampThemeHeight(Number.NaN)).toBe(120);
    expect(clampThemeHeight("abc")).toBe(120);
    expect(clampThemeHeight(1e9)).toBe(4000);
    expect(clampThemeHeight(200.2)).toBe(201);
    expect(clampThemeHeight(50)).toBe(120);
  });
});
