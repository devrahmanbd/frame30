/**
 * CONFLICT lane suite (cases only).
 *
 * Covers, against `src/lib/package-conflicts.ts` (pure) and the pipeline
 * gates in `src/lib/package-install.server.ts`:
 * - namespace claim extraction across widgets/templates/presentations/
 *   routes/assets/menus, for theme manifests, plugin manifests and files;
 * - the pairwise scan: blocking overlaps fail closed with
 *   `conflict.<namespace>:<id>` codes, isolated-by-design overlaps ride
 *   `shared` and never block, same-slug lines never conflict;
 * - the dependency version-range solver (exact/caret/pair, legacy-unknown
 *   rows, multi-row ledgers) and its install-path codes
 *   (`package.missing_dependency` preserved, `package.dependency_conflict`);
 * - install/activate wiring: menu-swap and exclusive-hook collisions fail
 *   closed with zero partial state; theme dressing never false-positives;
 *   enable re-scans; theme activation needs no scan (single-active);
 * - the cross-version capability matrix: themeable-contract v1 allowed /
 *   v2 removed (gate + resolution behavior), scope allow/deny incl. the
 *   menu-read compat rule, theme capability vocabulary, builder API ranges.
 *
 * No network, no real database: persistence is the in-memory fakeDb, zips
 * are hand-built (no npm zip libraries).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { deflateRawSync } from "node:zlib";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  installPackage,
  setPluginPackageEnabled,
  setPackageManifestValidator,
  stubManifestValidator,
} from "./package-install.server";
import {
  checkDependencyRanges,
  dependencyConflictCodes,
  emptyClaims,
  extractFileClaims,
  extractPluginClaims,
  extractThemeClaims,
  mergeClaims,
  satisfiesVersionRange,
  scanNamespaceConflicts,
  type ConflictPackage,
  type NamespaceClaims,
} from "./package-conflicts";
import { parseManifest } from "./plugin-manifest";
import type { PluginResolution } from "./plugin-manifest";
import { authorizeWidgetCall, menuReadGranted } from "./marketplace-scopes";
import {
  normalizeThemeContract,
  pluginWidgetClass,
  resolveCommunityRender,
} from "./plugin-theme-contract";
import { validateThemeManifest } from "./theme-package";
import { checkApiCompatibility } from "./registry-version";

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";

/* ------------------------------------------------------- tiny zip builder */

const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff,
];

type Entry = { name: string; content: string; method?: 0 | 8 };

function buildZip(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const nameBytes = Array.from(enc.encode(e.name));
    const raw = enc.encode(e.content);
    const method = e.method ?? 0;
    const payload = Array.from(method === 8 ? deflateRawSync(raw) : raw);
    const localOffset = out.length;
    out.push(
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0), ...u32(payload.length), ...u32(raw.length),
      ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...payload,
    );
    central.push(
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0), ...u32(payload.length), ...u32(raw.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(localOffset), ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  );
  return new Uint8Array(out);
}

function themeZip(
  manifest: Record<string, unknown>,
  extra: Entry[] = [],
): Uint8Array {
  return buildZip([
    { name: "theme.json", content: JSON.stringify(manifest), method: 8 },
    { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
    ...extra,
  ]);
}

function pluginZip(manifest: Record<string, unknown>, extra: Entry[] = []): Uint8Array {
  return buildZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
    ...extra,
  ]);
}

function pkgDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      plugin_state: [],
    },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

let keySeq = 0;
const key = () => `conflict-key-${(keySeq += 1)}`;

function strictTheme(
  version = "1.0.0",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    key: "test-theme",
    name: "Test Theme",
    nameBn: "টেস্ট থিম",
    version,
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
    ...extra,
  };
}

function strictPlugin(
  id: string,
  version = "1.0.0",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: id,
    version,
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [
      { key: "main", label: "Main", slots: ["main"], entry: "mount(el)" },
    ],
    hooks: [],
    ...extra,
  };
}

function swapPlugin(id: string, slot = "menu_bar"): Record<string, unknown> {
  return strictPlugin(id, "1.0.0", {
    permissions: ["render_storefront", "replace_menus"],
    widgets: [{ key: "nav", label: "Nav", slots: [slot], entry: "mount(el)" }],
  });
}

function claimPkg(
  slug: string,
  kind: "theme" | "plugin",
  claims: Partial<NamespaceClaims>,
): ConflictPackage {
  return { slug, kind, version: "1.0.0", claims: { ...emptyClaims(), ...claims } };
}

beforeEach(() => {
  setPackageManifestValidator(null);
});

/* ------------------------------------------------------- extraction */

describe("CONFLICT claim extraction", () => {
  it("extracts all six theme namespaces from a manifest", () => {
    const claims = extractThemeClaims({
      supportedWidgets: ["hero", "heading"],
      pluginDependencies: [{ ref: "plugin:acme/reviews", version: "^1.0.0" }],
      templates: ["index", "product"],
      presentationSurfaces: ["widget", "menu"],
      assetManifest: [
        { path: "assets/hero.webp", sha256: "a".repeat(64) },
      ],
    });
    expect(claims.widget).toEqual(["plugin:acme/reviews", "widget:heading", "widget:hero"]);
    expect(claims.template).toEqual(["index", "product"]);
    expect(claims.presentation).toEqual(["surface:menu", "surface:widget"]);
    expect(claims.route).toEqual(["route:index", "route:product"]);
    expect(claims.asset).toEqual(["assets/hero.webp"]);
    expect(claims.menu).toEqual(["menu:bindings"]);
  });

  it("extracts plugin ownership ids, swap slots and exclusive hooks only", () => {
    const claims = extractPluginClaims({
      id: "acme-nav",
      permissions: ["render_storefront", "replace_menus"],
      widgets: [
        { key: "nav", slots: ["menu_bar"] },
        { key: "rail", slots: ["main"] },
      ],
      hooks: ["cart.calculate", "order.created"],
    });
    expect(claims.widget).toEqual(["plugin:acme-nav/nav", "plugin:acme-nav/rail"]);
    // Swap intent (replace_menus + menu slot) is the claim; main-slot is not.
    expect(claims.menu).toEqual(["menu:menu_bar"]);
    // Exclusive hooks claim the route pipeline; notifications fan out.
    expect(claims.route).toEqual(["hook:cart.calculate"]);
  });

  it("extracts nothing exclusive from a fill-only plugin (fan-in by design)", () => {
    const claims = extractPluginClaims({
      id: "acme-fill",
      permissions: ["render_storefront"],
      widgets: [{ key: "links", slots: ["menu_bar"] }],
      hooks: ["order.created"],
    });
    expect(claims.menu).toEqual([]);
    expect(claims.route).toEqual([]);
    expect(claims.widget).toEqual(["plugin:acme-fill/links"]);
  });

  it("extracts file-level template and asset ids", () => {
    const claims = extractFileClaims([
      { path: "templates/index.json" },
      { path: "templates/product.json" },
      { path: "assets/hero.webp" },
      { path: "theme.json" },
    ]);
    expect(claims.template).toEqual(["index", "product"]);
    expect(claims.asset).toEqual(["assets/hero.webp"]);
    expect(claims.widget).toEqual([]);
  });

  it("degrades malformed input to empty claims and merges unions", () => {
    expect(extractThemeClaims(null)).toEqual(emptyClaims());
    expect(extractPluginClaims("nope")).toEqual(emptyClaims());
    expect(extractFileClaims(null as never)).toEqual(emptyClaims());
    const merged = mergeClaims(
      { ...emptyClaims(), menu: ["menu:menu_bar"] },
      { ...emptyClaims(), menu: ["menu:menu_bar"], route: ["hook:cart.calculate"] },
    );
    expect(merged.menu).toEqual(["menu:menu_bar"]);
    expect(merged.route).toEqual(["hook:cart.calculate"]);
  });
});

/* ------------------------------------------------------------- scan */

describe("CONFLICT pairwise scan", () => {
  it("fails closed on a menu-swap collision with holder + code", () => {
    const candidate = claimPkg("swap-b", "plugin", { menu: ["menu:menu_bar"] });
    const installed = [claimPkg("swap-a", "plugin", { menu: ["menu:menu_bar"] })];
    const verdict = scanNamespaceConflicts(candidate, installed);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.conflicts).toHaveLength(1);
      expect(verdict.conflicts[0]).toMatchObject({
        namespace: "menu",
        id: "menu:menu_bar",
        holder: "swap-a",
        code: "conflict.menu:menu:menu_bar",
        blocking: true,
      });
    }
  });

  it("fails closed on an exclusive-hook collision but not on notifications", () => {
    const candidate = claimPkg("calc-b", "plugin", { route: ["hook:cart.calculate"] });
    const installed = [claimPkg("calc-a", "plugin", { route: ["hook:cart.calculate"] })];
    const verdict = scanNamespaceConflicts(candidate, installed);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.conflicts[0]!.code).toBe("conflict.route:hook:cart.calculate");
    }
    // Notification hooks are never claims: nothing to collide on.
    const quiet = scanNamespaceConflicts(
      claimPkg("note-b", "plugin", emptyClaims()),
      [claimPkg("note-a", "plugin", emptyClaims())],
    );
    expect(quiet.ok).toBe(true);
  });

  it("flags plugin widget ownership collisions across slugs", () => {
    const candidate = claimPkg("other", "plugin", { widget: ["plugin:acme/reviews"] });
    const installed = [claimPkg("acme", "plugin", { widget: ["plugin:acme/reviews"] })];
    const verdict = scanNamespaceConflicts(candidate, installed);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.conflicts[0]!.code).toBe("conflict.widget:plugin:acme/reviews");
    }
  });

  it("never blocks theme dressing of an installed plugin (dress != own)", () => {
    const theme = claimPkg("my-theme", "theme", { widget: ["plugin:acme/reviews"] });
    const plugin = claimPkg("acme", "plugin", { widget: ["plugin:acme/reviews"] });
    const verdict = scanNamespaceConflicts(theme, [plugin]);
    expect(verdict.ok).toBe(true);
    expect(verdict.shared).toHaveLength(1);
    expect(verdict.shared[0]).toMatchObject({ blocking: false });
  });

  it("treats template/route/presentation/asset overlaps as shared, never blocking", () => {
    const candidate = claimPkg("theme-b", "theme", {
      template: ["index"],
      route: ["route:index"],
      presentation: ["surface:widget"],
      asset: ["assets/hero.webp"],
    });
    const installed = [
      claimPkg("theme-a", "theme", {
        template: ["index"],
        route: ["route:index"],
        presentation: ["surface:widget"],
        asset: ["assets/hero.webp"],
      }),
    ];
    const verdict = scanNamespaceConflicts(candidate, installed);
    expect(verdict.ok).toBe(true);
    expect(verdict.shared.map((s) => s.code)).toEqual([
      "conflict.asset:assets/hero.webp",
      "conflict.presentation:surface:widget",
      "conflict.route:route:index",
      "conflict.template:index",
    ]);
  });

  it("ignores same-slug lines and empty installed sets", () => {
    const candidate = claimPkg("swap-a", "plugin", { menu: ["menu:menu_bar"] });
    expect(scanNamespaceConflicts(candidate, []).ok).toBe(true);
    expect(
      scanNamespaceConflicts(candidate, [claimPkg("swap-a", "plugin", { menu: ["menu:menu_bar"] })]).ok,
    ).toBe(true);
  });

  it("never throws on malformed scan input", () => {
    expect(scanNamespaceConflicts(null as never, null as never).ok).toBe(true);
  });
});

/* ------------------------------------------------------- range solver */

describe("CONFLICT version-range solver", () => {
  it.each([
    ["1.2.0", "1.2.0", true],
    ["1.2.1", "1.2.0", false],
    ["1.5.0", "^1.2.0", true],
    ["1.2.0", "^1.2.0", true],
    ["1.1.9", "^1.2.0", false],
    ["2.0.0", "^1.2.0", false],
    ["1.9.9", ">=1.2.0 <2.0.0", true],
    ["2.0.0", ">=1.2.0 <2.0.0", false],
    ["1.2.0", ">=1.2.0 <2.0.0", true],
    ["1.0.0", "banana", false],
    ["", "^1.0.0", false],
    ["1.0.0", "", false],
  ])("satisfiesVersionRange(%p, %p) = %p", (version, range, expected) => {
    expect(satisfiesVersionRange(version, range)).toBe(expected);
  });

  it("separates missing from mismatched with stable codes", () => {
    const verdict = checkDependencyRanges(
      [
        { slug: "gone" },
        { slug: "stale", version: "^2.0.0" },
        { slug: "fresh", version: "^1.0.0" },
        { slug: "legacy", version: "^1.0.0" },
        { slug: "any" },
      ],
      [
        { slug: "stale", version: "1.0.0" },
        { slug: "fresh", version: "1.4.2" },
        { slug: "legacy", version: "" },
        { slug: "any", version: "9.9.9" },
      ],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.missing).toEqual(["gone"]);
      expect(verdict.mismatched).toEqual([{ slug: "stale", want: "^2.0.0", got: "1.0.0" }]);
    }
    expect(dependencyConflictCodes(verdict)).toEqual([
      "dependency.missing:gone",
      "dependency.version:stale",
    ]);
  });

  it("accepts when any live row satisfies (successive ledger history)", () => {
    const verdict = checkDependencyRanges(
      [{ slug: "acme", version: "^2.0.0" }],
      [
        { slug: "acme", version: "1.0.0" },
        { slug: "acme", version: "2.1.0" },
      ],
    );
    expect(verdict.ok).toBe(true);
  });

  it("never throws on malformed solver input", () => {
    expect(checkDependencyRanges(null as never, null as never).ok).toBe(true);
    expect(dependencyConflictCodes({ ok: true, missing: [], mismatched: [] })).toEqual([]);
  });
});

/* ------------------------------------------------------- pipeline wiring */

describe("CONFLICT install-path gates", () => {
  function seedLedger(
    db: ReturnType<typeof fakeDb>,
    rows: Record<string, unknown>[],
  ) {
    for (const row of rows) db.rows("marketplace_installs").push(row);
  }

  function seedProjection(
    db: ReturnType<typeof fakeDb>,
    rows: Record<string, unknown>[],
  ) {
    for (const row of rows) db.rows("plugin_state").push(row);
  }

  function installPlugin(
    db: ReturnType<typeof fakeDb>,
    zip: Uint8Array,
    opts: { key?: string } = {},
  ) {
    return installPackage(
      db.asClient(),
      MERCHANT_A,
      { kind: "plugin", fileName: "p.zip", bytes: zip, idempotencyKey: opts.key ?? key() },
      ACTOR,
    );
  }

  function installTheme(
    db: ReturnType<typeof fakeDb>,
    zip: Uint8Array,
    opts: { key?: string } = {},
  ) {
    return installPackage(
      db.asClient(),
      MERCHANT_A,
      { kind: "theme", fileName: "t.zip", bytes: zip, idempotencyKey: opts.key ?? key() },
      ACTOR,
    );
  }

  it("installs a theme whose dependency range is satisfied", async () => {
    const db = pkgDb();
    seedLedger(db, [
      { id: "dep-1", merchant_id: MERCHANT_A, kind: "widget", listing_slug: "chat-widget", version: "1.5.0", status: "installed" },
    ]);
    const zip = themeZip(
      strictTheme("1.0.0", {
        key: "needs-chat",
        pluginDependencies: [{ ref: "plugin:chat-widget", version: "^1.0.0" }],
      }),
    );
    const res = await installTheme(db, zip);
    expect(res.alreadyInstalled).toBe(false);
  });

  it("fails closed on a proven dependency version mismatch", async () => {
    const db = pkgDb();
    seedLedger(db, [
      { id: "dep-1", merchant_id: MERCHANT_A, kind: "widget", listing_slug: "chat-widget", version: "1.0.0", status: "installed" },
    ]);
    const zip = themeZip(
      strictTheme("1.0.0", {
        key: "needs-chat-v2",
        pluginDependencies: [{ ref: "plugin:chat-widget", version: "^2.0.0" }],
      }),
    );
    expect(await codeOf(installTheme(db, zip))).toBe("package.dependency_conflict");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("keeps legacy version-less ledger rows on presence-only (no mismatch)", async () => {
    const db = pkgDb();
    seedLedger(db, [
      { id: "dep-1", merchant_id: MERCHANT_A, kind: "widget", listing_slug: "chat-widget", status: "installed" },
    ]);
    const zip = themeZip(
      strictTheme("1.0.0", {
        key: "needs-chat-legacy",
        pluginDependencies: [{ ref: "plugin:chat-widget", version: "1.0.0" }],
      }),
    );
    const res = await installTheme(db, zip);
    expect(res.alreadyInstalled).toBe(false);
  });

  it("fails closed on a garbage plugin dependency range via the stub seam", async () => {
    const db = pkgDb();
    seedLedger(db, [
      { id: "dep-1", merchant_id: MERCHANT_A, kind: "widget", listing_slug: "dep-x", version: "1.0.0", status: "installed" },
    ]);
    const zip = pluginZip({ name: "P", version: "1.0.0", dependencies: [{ slug: "dep-x", version: "someday" }] });
    const promise = installPackage(
      db.asClient(),
      MERCHANT_A,
      { kind: "plugin", fileName: "p.zip", bytes: zip, idempotencyKey: key(), validator: stubManifestValidator },
      ACTOR,
    );
    expect(await codeOf(promise)).toBe("package.dependency_conflict");
  });

  it("fails closed installing a menu swap over a live holder, with zero partial state", async () => {
    const db = pkgDb();
    seedProjection(db, [
      {
        id: "proj-a",
        merchant_id: MERCHANT_A,
        plugin_id: "swap-a",
        manifest: swapPlugin("swap-a"),
        scopes: ["render_storefront", "replace_menus"],
        enabled: true,
        suspended: null,
      },
    ]);
    const before = {
      installs: db.rows("marketplace_installs").length,
      assets: db.rows("theme_assets").length,
    };
    expect(await codeOf(installPlugin(db, pluginZip(swapPlugin("swap-b"))))).toBe(
      "package.namespace_conflict",
    );
    expect(db.rows("marketplace_installs")).toHaveLength(before.installs);
    expect(db.rows("theme_assets")).toHaveLength(before.assets);
  });

  it("installs a menu swap when holders are paused or absent", async () => {
    const db = pkgDb();
    seedProjection(db, [
      {
        id: "proj-a",
        merchant_id: MERCHANT_A,
        plugin_id: "swap-a",
        manifest: swapPlugin("swap-a"),
        scopes: ["render_storefront", "replace_menus"],
        enabled: false,
        suspended: null,
      },
    ]);
    const res = await installPlugin(db, pluginZip(swapPlugin("swap-b")));
    expect(res.alreadyInstalled).toBe(false);
  });

  it("fails closed on an exclusive-hook collision at install", async () => {
    const db = pkgDb();
    seedProjection(db, [
      {
        id: "proj-a",
        merchant_id: MERCHANT_A,
        plugin_id: "calc-a",
        manifest: strictPlugin("calc-a", "1.0.0", {
          hooks: ["cart.calculate"],
          hooksUrl: "https://apps.example.com/hooks",
        }),
        scopes: ["render_storefront"],
        enabled: true,
        suspended: null,
      },
    ]);
    const candidate = strictPlugin("calc-b", "1.0.0", {
      hooks: ["cart.calculate"],
      hooksUrl: "https://apps.example.com/hooks",
    });
    expect(await codeOf(installPlugin(db, pluginZip(candidate)))).toBe(
      "package.namespace_conflict",
    );
  });

  it("installs a theme that dresses an installed plugin (no false positive)", async () => {
    const db = pkgDb();
    seedProjection(db, [
      {
        id: "proj-reviews",
        merchant_id: MERCHANT_A,
        plugin_id: "acme-reviews",
        manifest: strictPlugin("acme-reviews"),
        scopes: ["render_storefront"],
        enabled: true,
        suspended: null,
      },
    ]);
    const zip = themeZip(
      strictTheme("1.0.0", {
        key: "dresses-reviews",
        supportedWidgets: ["hero"],
        pluginDependencies: [{ ref: "plugin:acme-reviews/main", version: "^1.0.0" }],
      }),
    );
    seedLedger(db, [
      { id: "dep-1", merchant_id: MERCHANT_A, kind: "widget", listing_slug: "acme-reviews", version: "1.0.0", status: "installed" },
    ]);
    const res = await installTheme(db, zip);
    expect(res.alreadyInstalled).toBe(false);
  });
});

/* ------------------------------------------------------- activate-path gates */

describe("CONFLICT activate-path gates", () => {
  function seedProjection(
    db: ReturnType<typeof fakeDb>,
    rows: Record<string, unknown>[],
  ) {
    for (const row of rows) db.rows("plugin_state").push(row);
  }

  it("refuses to enable a swap plugin while another live holder exists", async () => {
    const db = pkgDb();
    const installId = "ledger-swap-b";
    db.rows("marketplace_installs").push({
      id: installId,
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "swap-b",
      version: "1.0.0",
      status: "paused",
    });
    seedProjection(db, [
      {
        id: "proj-a", merchant_id: MERCHANT_A, plugin_id: "swap-a",
        manifest: {
          id: "swap-a", name: "swap-a", version: "1.0.0", api: "^3.0.0",
          permissions: ["render_storefront", "replace_menus"],
          widgets: [{ key: "nav", label: "Nav", slots: ["menu_bar"], entry: "mount(el)" }],
          hooks: [],
        },
        scopes: ["render_storefront", "replace_menus"], enabled: true, suspended: null,
      },
      {
        id: "proj-b", merchant_id: MERCHANT_A, plugin_id: "swap-b",
        manifest: {
          id: "swap-b", name: "swap-b", version: "1.0.0", api: "^3.0.0",
          permissions: ["render_storefront", "replace_menus"],
          widgets: [{ key: "nav", label: "Nav", slots: ["menu_bar"], entry: "mount(el)" }],
          hooks: [],
        },
        scopes: ["render_storefront", "replace_menus"], enabled: true, suspended: null,
      },
    ]);
    expect(
      await codeOf(setPluginPackageEnabled(db.asClient(), MERCHANT_A, installId, true, ACTOR)),
    ).toBe("package.namespace_conflict");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === installId)!.status,
    ).toBe("paused");
  });

  it("enables a swap plugin once the other holder is paused", async () => {
    const db = pkgDb();
    const installId = "ledger-swap-b";
    db.rows("marketplace_installs").push({
      id: installId,
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "swap-b",
      version: "1.0.0",
      status: "paused",
    });
    seedProjection(db, [
      {
        id: "proj-a", merchant_id: MERCHANT_A, plugin_id: "swap-a",
        manifest: {
          id: "swap-a", name: "swap-a", version: "1.0.0", api: "^3.0.0",
          permissions: ["render_storefront", "replace_menus"],
          widgets: [{ key: "nav", label: "Nav", slots: ["menu_bar"], entry: "mount(el)" }],
          hooks: [],
        },
        scopes: ["render_storefront", "replace_menus"], enabled: false, suspended: null,
      },
      {
        id: "proj-b", merchant_id: MERCHANT_A, plugin_id: "swap-b",
        manifest: {
          id: "swap-b", name: "swap-b", version: "1.0.0", api: "^3.0.0",
          permissions: ["render_storefront", "replace_menus"],
          widgets: [{ key: "nav", label: "Nav", slots: ["menu_bar"], entry: "mount(el)" }],
          hooks: [],
        },
        scopes: ["render_storefront", "replace_menus"], enabled: true, suspended: null,
      },
    ]);
    const res = await setPluginPackageEnabled(db.asClient(), MERCHANT_A, installId, true, ACTOR);
    expect(res.status).toBe("installed");
  });

  it("disabling never scans (contention only shrinks)", async () => {
    const db = pkgDb();
    const installId = "ledger-swap-b";
    db.rows("marketplace_installs").push({
      id: installId,
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "swap-b",
      version: "1.0.0",
      status: "installed",
    });
    seedProjection(db, [
      {
        id: "proj-a", merchant_id: MERCHANT_A, plugin_id: "swap-a",
        manifest: {
          id: "swap-a", name: "swap-a", version: "1.0.0", api: "^3.0.0",
          permissions: ["render_storefront", "replace_menus"],
          widgets: [{ key: "nav", label: "Nav", slots: ["menu_bar"], entry: "mount(el)" }],
          hooks: [],
        },
        scopes: ["render_storefront", "replace_menus"], enabled: true, suspended: null,
      },
    ]);
    const res = await setPluginPackageEnabled(db.asClient(), MERCHANT_A, installId, false, ACTOR);
    expect(res.status).toBe("paused");
  });
});

/* ------------------------------------------------------- capability matrix */

describe("CONFLICT capability matrix across versions", () => {
  const v1Contract = { version: 1, schema: "plugin://acme/reviews/schema" };
  const v1Widget = {
    key: "reviews",
    label: "Reviews",
    slots: ["main"],
    entry: "mount(el)",
    themeable: { ...v1Contract },
  };
  const v1Manifest = {
    id: "acme-reviews",
    name: "Acme Reviews",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [v1Widget],
    hooks: [],
  };

  it("v1 themeable contract: allowed (gate accepts, dress path reachable)", () => {
    expect(normalizeThemeContract(v1Contract)).not.toBeNull();
    const verdict = parseManifest(v1Manifest);
    expect(verdict.ok).toBe(true);
  });

  it("v2 themeable contract: removed (gate rejects, install fails closed)", async () => {
    expect(normalizeThemeContract({ version: 2, schema: "ref" })).toBeNull();
    const verdict = parseManifest({
      ...v1Manifest,
      widgets: [{ ...v1Widget, themeable: { version: 2, schema: "ref" } }],
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errors).toContain("widgets[0].themeable");
    const db = pkgDb();
    const zip = pluginZip({
      ...v1Manifest,
      widgets: [{ ...v1Widget, themeable: { version: 2, schema: "ref" } }],
    });
    expect(
      await codeOf(
        installPackage(
          db.asClient(),
          MERCHANT_A,
          { kind: "plugin", fileName: "p.zip", bytes: zip, idempotencyKey: key() },
          ACTOR,
        ),
      ),
    ).toBe("package.manifest_invalid");
  });

  it("v2-class widget can never reach the dressed path (sandbox, never theme)", () => {
    // A v2 declaration carries no valid contract, so the widget reads as
    // Class A (isolated) — the dressed `theme` decision is unreachable.
    expect(pluginWidgetClass(null)).toBe("isolated");
    expect(pluginWidgetClass({})).toBe("isolated");
    const resolution = {
      ok: true as const,
      plugin: {
        installId: "install-1",
        manifest: v1Manifest,
        grantedScopes: ["render_storefront"],
        settings: {},
        enabled: true,
      },
      widget: {
        key: "reviews",
        label: "Reviews",
        slots: ["main"],
        entry: "mount(el)",
      },
    } as unknown as Extract<PluginResolution, { ok: true }>;
    expect(resolveCommunityRender(resolution, { themeKey: "t", pluginKey: "plugin:acme-reviews/reviews" }).kind).toBe(
      "sandbox",
    );
  });

  it("scope allow/deny matrix at the sandbox gate", () => {
    const call = (method: string) => ({ v: 1, id: "m1", method });
    expect(authorizeWidgetCall(call("products.list"), ["read_products"])).toMatchObject({
      allowed: true,
    });
    expect(authorizeWidgetCall(call("products.list"), [])).toMatchObject({
      allowed: false,
      reason: "scope_denied",
    });
    expect(authorizeWidgetCall(call("nope.call"), ["read_products"])).toMatchObject({
      allowed: false,
      reason: "unknown_method",
    });
    expect(authorizeWidgetCall({ v: 2, id: "m1", method: "products.list" }, ["read_products"])).toMatchObject(
      {
        allowed: false,
        reason: "malformed",
      },
    );
  });

  it("menu reads keep working for pre-menu-track grants (bridge compat, not scope rewrite)", () => {
    // The raw gate is scope-exact: render_storefront alone does NOT satisfy
    // the read_menus binding at this layer…
    expect(
      authorizeWidgetCall({ v: 1, id: "m1", method: "menus.list" }, ["render_storefront"]),
    ).toMatchObject({ allowed: false, reason: "scope_denied" });
    // …while the bridge-level implication preserves older installs without
    // a fresh consent screen (menus.list stays readable).
    expect(menuReadGranted(["render_storefront"])).toBe(true);
    expect(menuReadGranted(["read_menus"])).toBe(true);
    expect(menuReadGranted([])).toBe(false);
  });

  it("theme capability vocabulary: allowed subset, forbidden PII/mutating, unknown rejected", () => {
    const base = {
      key: "cap-theme",
      name: "Cap Theme",
      nameBn: "ক্যাপ থিম",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["widget"],
      locales: ["en"],
    };
    expect(validateThemeManifest({ ...base, capabilities: ["render_storefront"] }).ok).toBe(true);
    expect(
      validateThemeManifest({ ...base, capabilities: ["render_storefront", "read_products"] }).ok,
    ).toBe(true);
    const forbidden = validateThemeManifest({
      ...base,
      capabilities: ["render_storefront", "write_products"],
    });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) {
      expect(forbidden.errors).toContain("capabilities.forbidden:write_products");
    }
    const pii = validateThemeManifest({
      ...base,
      capabilities: ["render_storefront", "read_orders"],
    });
    expect(pii.ok).toBe(false);
    if (!pii.ok) expect(pii.errors).toContain("capabilities.forbidden:read_orders");
    const unknown = validateThemeManifest({
      ...base,
      capabilities: ["render_storefront", "nuke_everything"],
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors).toContain("capabilities:nuke_everything");
    const missing = validateThemeManifest({ ...base, capabilities: ["read_products"] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors).toContain("capabilities.render_storefront_required");
    }
  });

  it("builder API range matrix across versions", () => {
    expect(checkApiCompatibility("^3.0.0").ok).toBe(true);
    expect(checkApiCompatibility(">=3.0.0 <4.0.0").ok).toBe(true);
    const old = checkApiCompatibility("^2.0.0");
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.code).toBe("registry.api_incompatible");
    const garbage = checkApiCompatibility("banana");
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.code).toBe("registry.api_range_invalid");
    // Missing range = built-before-ranges preset default, not "anything".
    expect(checkApiCompatibility(undefined).ok).toBe(true);
  });
});
