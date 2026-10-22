/**
 * Widget E2E workflow — 16-step proof with REAL units (TDD).
 *
 * Fixture: `__fixtures__/e2e-widget-plugin/` (one installable `plugin.json`
 * carrying two widgets + one control schema per widget). The suite installs
 * the fixture through the NORMAL `installPackage` pipeline (kind "plugin",
 * no validator override — the strict default gate runs), projects it with
 * the real host (`upsertPlugin`), lists it with the real readers
 * (`listInstalledPlugins`, `fromPluginManifest`, the studio tray entries),
 * registers it in real registries (`createWidgetRegistry`), inserts through
 * the real tray insert (`buildExtensionInsert` / `insertPluginWidget`), and
 * validates with the shared value layer (`validateProps` / `defaultsFor`).
 *
 * No mocks of the system under test: only `fakeDb` (persistence boundary)
 * and `buildTestZip` (archive bytes) are fakes — the same boundary fakes
 * `plugin-package-acceptance.test.ts` uses.
 *
 * `DynamicTagPicker` is referenced read-only (source presence, never
 * imported/wired — binding itself is proven through the real
 * `resolveDynamicText` / `resolveDynamicProps` value units).
 *
 * Steps:
 *  01 install via pipeline (+ enable flip) ............ installPackage
 *  02 registry lists both widgets, core untouched ...... fromPluginManifest
 *  03 insert initializes defaults ...................... buildExtensionInsert
 *  04 unique ids (duplicate-id remap rule) ............. parseAst
 *  05 schema controls validate (+ data-binding) ........ validateProps
 *  06 duplicate gets a new id .......................... clone + parse
 *  07 duplicate values stay independent ................ validateProps
 *  08 edit isolation (fresh objects, no shared refs) ... defaultsFor
 *  09 save/reload preserves values ..................... JSON round-trip
 *  10 repeater order preserved ......................... rows round-trip
 *  11 tablet independence .............................. bp layer + responsive
 *  12 mobile independence .............................. bp layer + responsive
 *  13 theme switch preserves data ...................... withThemeWidgetDefaults
 *  14 disable keeps data recoverable ................... resolveExtensionNode
 *  15 malformed handled ................................ pipeline + placeholder
 *  16 incompatible handled ............................. pipeline + placeholder
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { buildTestZip } from "./__fixtures__/test-zip";
import {
  installPackage,
  setPluginPackageEnabled,
} from "./package-install.server";
import {
  BUILDER_API_VERSION,
  parseManifest,
  pluginWidgetKey,
  type InstalledPlugin,
} from "./plugin-manifest";
import { listInstalledPlugins, upsertPlugin } from "./plugins.server";
import {
  createWidgetRegistry,
  fromPluginManifest,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import {
  buildExtensionInsert,
  insertPluginWidget,
  studioPluginTrayEntries,
} from "../components/builder/studio/plugin-tray";
import {
  CONTROL_STATUS,
  controlStatus,
  defaultsFor,
  validateProps,
  type PropField,
} from "./widget-props";
import {
  EXTENSION_MISSING_KEY,
  isExtensionNode,
  ownerForWidgetKey,
  parseAst,
  pluginBlockToExtension,
  resolveExtensionNode,
  SECTION_CATALOG,
  withThemeWidgetDefaults,
  type ExtensionNode,
  type Section,
  type SectionType,
} from "./builder-ast";
import { resolveDynamicProps, resolveDynamicText } from "./dynamic-tags";

const MERCHANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const SIMPLE_KEY = "plugin:e2e-widgets/simple_card";
const COMPLEX_KEY = "plugin:e2e-widgets/complex_list";
const EXT = "extension" as unknown as SectionType;

const FIXTURE_DIR = fileURLToPath(
  new URL("./__fixtures__/e2e-widget-plugin/", import.meta.url),
);

type WidgetSchemaFile = { widget: string; fields: PropField[] };

function readFixtureJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function loadSchema(name: string): WidgetSchemaFile {
  const raw = readFixtureJson(name);
  return { widget: String(raw.widget), fields: raw.fields as PropField[] };
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
      plugin_kill_switch: [],
      activity_log: [],
    },
  });
}

let keySeq = 0;
const key = () => `e2e-workflow-${(keySeq += 1)}`;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

function fixtureZip(manifest: Record<string, unknown>): Uint8Array {
  return buildTestZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
  ]);
}

function asSection(node: ExtensionNode): Section {
  return node as unknown as Section;
}

let db: ReturnType<typeof fakeDb>;
let manifestRaw: Record<string, unknown>;
let simpleSchema: WidgetSchemaFile;
let complexSchema: WidgetSchemaFile;
let packageId = "";
let artifactId = "";
let installed: InstalledPlugin[] = [];

beforeAll(async () => {
  manifestRaw = readFixtureJson("plugin.json");
  simpleSchema = loadSchema("simple-card.schema.json");
  complexSchema = loadSchema("complex-list.schema.json");
  expect(simpleSchema.widget).toBe(SIMPLE_KEY);
  expect(complexSchema.widget).toBe(COMPLEX_KEY);
  expect(pluginWidgetKey("e2e-widgets", "simple_card")).toBe(SIMPLE_KEY);
  expect(pluginWidgetKey("e2e-widgets", "complex_list")).toBe(COMPLEX_KEY);

  db = pkgDb();
  const res = await installPackage(
    db.asClient(),
    MERCHANT,
    {
      kind: "plugin",
      fileName: "e2e-widgets.zip",
      bytes: fixtureZip(manifestRaw),
      idempotencyKey: key(),
    },
    ACTOR,
  );
  packageId = res.packageId;
  artifactId = res.artifactId;

  await upsertPlugin(db.asClient() as never, MERCHANT, {
    manifest: manifestRaw,
    grantedScopes: ["read_shop", "render_storefront"],
    actorId: ACTOR,
  });
  installed = await listInstalledPlugins(db.asClient() as never, MERCHANT);
});

/** Registry def pairing installed-manifest identity with a fixture schema. */
function schemaDef(adapter: WidgetDef, schema: WidgetSchemaFile): unknown {
  return {
    id: adapter.id,
    namespace: adapter.namespace,
    version: adapter.version,
    label: adapter.label,
    category: adapter.category,
    slots: [...adapter.slots],
    defaults: defaultsFor({ fields: schema.fields }),
    propsSchema: { fields: schema.fields },
    renderer: "sandbox",
    ...(adapter.minBuilderApi ? { minBuilderApi: adapter.minBuilderApi } : {}),
  };
}

function seedSchemaRegistry(): UnifiedRegistry {
  const registry = createWidgetRegistry();
  const byId = new Map(fromPluginManifest(installed).map((d) => [d.id, d]));
  const simple = byId.get(SIMPLE_KEY);
  const complex = byId.get(COMPLEX_KEY);
  if (!simple || !complex) throw new Error("fixture widgets not installed");
  expect(registry.registerWidget(schemaDef(simple, simpleSchema)).ok).toBe(
    true,
  );
  expect(registry.registerWidget(schemaDef(complex, complexSchema)).ok).toBe(
    true,
  );
  return registry;
}

let insertSeq = 0;

function insertNode(
  registry: UnifiedRegistry,
  widgetKey: string,
): ExtensionNode {
  const id = `e2e-node-${(insertSeq += 1)}`;
  const out = buildExtensionInsert(registry, {
    widgetKey,
    slot: "main",
    generateId: () => id,
  });
  if (!out.ok) throw new Error(`insert failed: ${out.error}`);
  expect(out.selectedId).toBe(id);
  return out.node;
}

describe("widget E2E workflow (fixture plugin, real units)", () => {
  it("STEP 01/16 — install travels the NORMAL pipeline + enable flip", async () => {
    expect(packageId).toBeTruthy();
    expect(artifactId).toMatch(/^[a-f0-9]{64}$/);
    const row = db.rows("marketplace_installs").find((r) => r.id === packageId);
    expect(row).toMatchObject({
      kind: "widget",
      listing_slug: "e2e-widgets",
      status: "installed",
      version: "1.0.0",
    });
    expect(
      db
        .rows("theme_assets")
        .every((a) => String(a.name).startsWith("plugins/e2e-widgets/")),
    ).toBe(true);
    expect(
      db.rows("theme_audit").some((r) => r.action === "package.installed"),
    ).toBe(true);

    const paused = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT,
      packageId,
      false,
      ACTOR,
    );
    expect(paused.status).toBe("paused");
    const live = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT,
      packageId,
      true,
      ACTOR,
    );
    expect(live.status).toBe("installed");
  });

  it("STEP 02/16 — registry lists both widgets, core catalogue untouched", () => {
    expect(SECTION_CATALOG.some((e) => e.type === EXT)).toBe(false);
    expect(SECTION_CATALOG.length).toBe(161);

    const verdict = parseManifest(manifestRaw);
    expect(verdict.ok).toBe(true);
    const found = installed.find((p) => p.manifest.id === "e2e-widgets");
    if (!found) throw new Error("fixture plugin not projected");
    expect(found.enabled).toBe(true);

    const adapters = fromPluginManifest(installed);
    expect(adapters.map((d) => d.id).sort()).toEqual([COMPLEX_KEY, SIMPLE_KEY]);

    // Palette proof through the real studio tray unit (same source WidgetTray
    // reads via the shared resolver semantics).
    const entries = studioPluginTrayEntries(installed);
    expect(entries.map((e) => e.key).sort()).toEqual([COMPLEX_KEY, SIMPLE_KEY]);

    const registry = createWidgetRegistry();
    for (const def of adapters) {
      expect(registry.registerWidget(def).ok).toBe(true);
    }
    expect(registry.widgetIds().sort()).toEqual([COMPLEX_KEY, SIMPLE_KEY]);
    expect(registry.resolveWidget(SIMPLE_KEY).ok).toBe(true);
    expect(registry.resolveWidget(COMPLEX_KEY).ok).toBe(true);
  });

  it("STEP 03/16 — insert initializes defaults (migration keeps every byte)", () => {
    const registry = seedSchemaRegistry();

    const simple = insertNode(registry, SIMPLE_KEY);
    expect(simple.type).toBe("extension");
    expect(simple.widgetKey).toBe(SIMPLE_KEY);
    expect(simple.owner).toEqual(ownerForWidgetKey(SIMPLE_KEY));
    expect(simple.owner).toEqual({ kind: "plugin", id: "e2e-widgets" });
    expect(simple.apiVersion).toBe(BUILDER_API_VERSION);
    expect(simple.instanceId).toBe(simple.id);
    expect(simple.props).toEqual({
      headline: "Hello from E2E",
      accent: "#0ea5e9",
      showBadge: true,
    });
    expect(simple.slots).toEqual(["main"]);

    const complex = insertNode(registry, COMPLEX_KEY);
    expect(complex.props).toMatchObject({
      title: "Top picks for {{product.title}}",
      layout: "grid",
    });
    expect(complex.props["items"]).toEqual([
      { name: "First", swatch: "#111111" },
      { name: "Second", swatch: "#222222" },
    ]);

    // Tray click wiring delivers the same canonical node to adopted callers.
    const wired: ExtensionNode[] = [];
    const handled = insertPluginWidget(
      registry,
      { widgetKey: SIMPLE_KEY, slot: "main", generateId: () => "e2e-wired-1" },
      {
        onAddExtension: (node) => {
          wired.push(node);
        },
      },
    );
    expect(handled.handled).toBe("extension");
    expect(wired[0]?.id).toBe("e2e-wired-1");
    expect(wired[0]?.props).toEqual(simple.props);

    // Legacy migration context: plugin_block promotes the key losslessly.
    const legacy = parseAst({
      main: [
        {
          id: "pb-legacy",
          type: "plugin_block",
          props: { pluginKey: SIMPLE_KEY, height: 420 },
        },
      ],
    }).main[0]!;
    const migrated = pluginBlockToExtension(legacy)!;
    expect(migrated.type).toBe("extension");
    expect(migrated.widgetKey).toBe(SIMPLE_KEY);
    expect(migrated.props).toMatchObject({ height: 420 });
    expect(pluginBlockToExtension(legacy)).not.toBeNull();
  });

  it("STEP 04/16 — inserts get unique ids (parse remap rule pinned)", () => {
    const registry = seedSchemaRegistry();
    const a = insertNode(registry, SIMPLE_KEY);
    const b = insertNode(registry, SIMPLE_KEY);
    expect(a.id).not.toBe(b.id);
    expect(a.instanceId).not.toBe(b.instanceId);

    const ast = parseAst({
      main: [
        { id: "dup", type: "extension", widgetKey: SIMPLE_KEY, props: {} },
        { id: "dup", type: "extension", widgetKey: SIMPLE_KEY, props: {} },
      ],
    });
    expect(ast.main.map((n) => n.id)).toEqual(["dup", "dup-2"]);
  });

  it("STEP 05/16 — schema controls validate (binding resolves, picker only referenced)", () => {
    const simple = validateProps(
      { fields: simpleSchema.fields },
      defaultsFor({ fields: simpleSchema.fields }),
    );
    expect(simple.ok).toBe(true);
    expect(simple.errors).toEqual([]);

    const complex = validateProps(
      { fields: complexSchema.fields },
      defaultsFor({ fields: complexSchema.fields }),
    );
    expect(complex.ok).toBe(true);
    expect(complex.errors).toEqual([]);

    expect(controlStatus("text")).toBe("full");
    expect(controlStatus("color")).toBe("full");
    expect(controlStatus("boolean")).toBe("full");
    expect(controlStatus("select")).toBe("full");
    expect(controlStatus("repeater")).toBe("structural");
    expect(CONTROL_STATUS.repeater).toBe("structural");

    // Fail closed with attributed codes, never a fallback input.
    const badColor = validateProps(
      { fields: simpleSchema.fields },
      {
        accent: "red",
      },
    );
    expect(badColor.ok).toBe(false);
    expect(badColor.errors).toContain("accent.not_a_color");
    const badOption = validateProps(
      { fields: complexSchema.fields },
      {
        layout: "masonry",
      },
    );
    expect(badOption.errors).toContain("layout.not_an_option");
    const badKind = validateProps(
      {
        fields: [
          { key: "x", label: "X", kind: "bogus" } as unknown as PropField,
        ],
      },
      {},
    );
    expect(badKind.errors).toContain("x.unknown_kind");

    // Data-binding through the real value units.
    expect(
      resolveDynamicText("Top picks for {{product.title}}", {
        product: { title: "Sample product" },
      }),
    ).toBe("Top picks for Sample product");
    expect(resolveDynamicText("SKU: {{product.sku|No SKU}}", {})).toBe(
      "SKU: No SKU",
    );
    expect(resolveDynamicText("SKU: {{product.sku}}", {})).toBe("SKU: ");
    expect(
      resolveDynamicProps(
        { title: "Hi {{site.title}}", items: [{ name: "{{product.title}}" }] },
        {
          site: { title: "Your store" },
          product: { title: "Sample product" },
        },
      ),
    ).toEqual({
      title: "Hi Your store",
      items: [{ name: "Sample product" }],
    });

    // DynamicTagPicker: reference only — present with its insert contract,
    // never imported or wired here (insertion stays plain-text splicing).
    const pickerSrc = readFileSync(
      fileURLToPath(
        new URL("../components/builder/DynamicTagPicker.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(pickerSrc).toContain("insertDynamicTag");
    expect(pickerSrc).toContain("data-dynamic-tag-picker");
  });

  it("STEP 06/16 — duplicate gets a new id with the same key + props", () => {
    const registry = seedSchemaRegistry();
    const src = insertNode(registry, SIMPLE_KEY);
    const clone = JSON.parse(JSON.stringify(src)) as ExtensionNode;
    clone.id = "e2e-dup-1";
    clone.instanceId = "e2e-dup-1";
    const dup = parseAst({ main: [clone] }).main[0]!;
    expect(isExtensionNode(dup)).toBe(true);
    expect(dup.id).toBe("e2e-dup-1");
    expect(dup.id).not.toBe(src.id);
    expect(dup.widgetKey).toBe(src.widgetKey);
    expect(dup.props).toEqual(src.props);
  });

  it("STEP 07/16 — duplicate values stay independent", () => {
    const registry = seedSchemaRegistry();
    const src = insertNode(registry, SIMPLE_KEY);
    const clone = JSON.parse(JSON.stringify(src)) as ExtensionNode;
    clone.id = "e2e-dup-2";
    clone.instanceId = "e2e-dup-2";
    const dupNode = parseAst({ main: [clone] }).main[0]!;
    const dup = dupNode as unknown as ExtensionNode;
    dup.props = { ...dup.props, headline: "Second card", accent: "#ff0000" };

    for (const props of [src.props, dup.props]) {
      const verdict = validateProps({ fields: simpleSchema.fields }, props);
      expect(verdict.ok).toBe(true);
    }
    expect(dup.props["headline"]).toBe("Second card");
    expect(src.props["headline"]).toBe("Hello from E2E");
    expect(src.props["accent"]).toBe("#0ea5e9");
  });

  it("STEP 08/16 — edits are isolated (no shared references)", () => {
    const first = defaultsFor({ fields: complexSchema.fields });
    const second = defaultsFor({ fields: complexSchema.fields });
    (first["items"] as Record<string, unknown>[])[0]!["name"] = "Mutated";
    expect((second["items"] as Record<string, unknown>[])[0]!["name"]).toBe(
      "First",
    );

    const clean = validateProps(
      { fields: complexSchema.fields },
      defaultsFor({ fields: complexSchema.fields }),
    ).clean;
    (clean["items"] as Record<string, unknown>[]).length = 0;
    expect(
      defaultsFor({ fields: complexSchema.fields })["items"] as unknown[],
    ).toHaveLength(2);
  });

  it("STEP 09/16 — save/reload preserves values byte-identically", () => {
    const registry = seedSchemaRegistry();
    const src = insertNode(registry, SIMPLE_KEY);
    const once = parseAst({
      main: [JSON.parse(JSON.stringify(asSection(src))) as unknown],
    });
    const twice = parseAst(JSON.parse(JSON.stringify(once)) as unknown);
    expect(twice).toEqual(once);
    const first = once.main[0]!;
    expect(first.props).toEqual({
      headline: "Hello from E2E",
      accent: "#0ea5e9",
      showBadge: true,
    });
    expect(first.widgetKey).toBe(SIMPLE_KEY);
    expect(first.instanceId).toBe(src.instanceId);

    const complex = insertNode(registry, COMPLEX_KEY);
    const reloaded = parseAst({
      main: [JSON.parse(JSON.stringify(asSection(complex))) as unknown],
    }).main[0]!;
    expect(reloaded.props).toEqual(complex.props);
  });

  it("STEP 10/16 — repeater order survives save/reload", () => {
    const registry = seedSchemaRegistry();
    const node = insertNode(registry, COMPLEX_KEY);
    const items = node.props["items"] as Record<string, unknown>[];
    const reordered = [
      items[1]!,
      items[0]!,
      { name: "Third", swatch: "#333333" },
    ];
    const verdict = validateProps(
      { fields: complexSchema.fields },
      { ...defaultsFor({ fields: complexSchema.fields }), items: reordered },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.clean["items"]).toEqual(reordered);

    const reloaded = parseAst({
      main: [
        {
          id: node.id,
          type: "extension",
          instanceId: node.instanceId,
          owner: node.owner,
          widgetKey: node.widgetKey,
          apiVersion: node.apiVersion,
          props: verdict.clean,
        },
      ],
    }).main[0]!;
    expect(
      (reloaded.props["items"] as Record<string, unknown>[]).map(
        (r) => r["name"],
      ),
    ).toEqual(["Second", "First", "Third"]);
  });

  it("STEP 11/16 — tablet overrides stay independent", () => {
    const base = defaultsFor({ fields: complexSchema.fields });
    const verdict = validateProps(
      { fields: complexSchema.fields },
      { ...base, bp: { tablet: { title: "Tablet title" } } },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.clean["title"]).toBe("Top picks for {{product.title}}");
    expect(verdict.clean["bp"]).toMatchObject({
      tablet: { title: "Tablet title" },
    });

    const ast = parseAst({
      main: [
        {
          id: "resp-1",
          type: "extension",
          widgetKey: COMPLEX_KEY,
          props: base,
          responsive: { tablet: { title: "Tablet title" } },
        },
      ],
    });
    expect(ast.main[0]!.responsive).toEqual({
      tablet: { title: "Tablet title" },
    });
  });

  it("STEP 12/16 — mobile overrides stay independent", () => {
    const base = defaultsFor({ fields: complexSchema.fields });
    const verdict = validateProps(
      { fields: complexSchema.fields },
      {
        ...base,
        bp: {
          tablet: { title: "Tablet title" },
          mobile: { title: "Mobile title", layout: "list" },
        },
      },
    );
    expect(verdict.ok).toBe(true);
    const bp = verdict.clean["bp"] as Record<string, Record<string, unknown>>;
    expect(bp["tablet"]!["title"]).toBe("Tablet title");
    expect(bp["mobile"]!["title"]).toBe("Mobile title");
    expect(bp["mobile"]!["layout"]).toBe("list");
    expect(bp["tablet"]!["layout"]).toBe("grid");

    const ast = parseAst({
      main: [
        {
          id: "resp-2",
          type: "extension",
          widgetKey: COMPLEX_KEY,
          props: base,
          responsive: {
            tablet: { title: "Tablet title" },
            mobile: { title: "Mobile title" },
            watch: { title: "Dropped" },
          },
        },
      ],
    });
    expect(ast.main[0]!.responsive).toEqual({
      tablet: { title: "Tablet title" },
      mobile: { title: "Mobile title" },
    });
  });

  it("STEP 13/16 — theme switch never clobbers authored data", () => {
    const authored = {
      headline: "Merchant copy",
      accent: "#123456",
      showBadge: false,
    };
    const theme = {
      [EXT]: { headline: "Theme default", accent: "#000000", extra: "new" },
    };
    expect(withThemeWidgetDefaults(EXT, authored, theme)).toEqual(authored);
    expect(withThemeWidgetDefaults(EXT, authored, undefined)).toEqual(authored);
  });

  it("STEP 14/16 — disable keeps data recoverable", () => {
    const registry = seedSchemaRegistry();
    const node = insertNode(registry, SIMPLE_KEY);
    const lookup = (
      widgetKey: string,
      ctx: { version?: string; builderApi?: string },
    ) => {
      const verdict = registry.resolveWidget(widgetKey, ctx);
      if (verdict.ok) return { ok: true as const };
      return { ok: false as const, reason: verdict.missing.reason };
    };

    const live = resolveExtensionNode(asSection(node), lookup);
    expect(live.missing).toBe(false);

    expect(registry.disableWidget(SIMPLE_KEY).ok).toBe(true);
    const miss = registry.resolveWidget(SIMPLE_KEY, {
      data: { headline: "kept" },
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("disabled");
      expect(miss.missing.preservedData).toEqual({ headline: "kept" });
    }
    const placeholder = resolveExtensionNode(asSection(node), lookup);
    expect(placeholder.missing).toBe(true);
    expect(placeholder.reason).toBe("disabled");
    expect(placeholder.node.props).toEqual(node.props);
    expect(placeholder.node.widgetKey).toBe(SIMPLE_KEY);

    expect(registry.enableWidget(SIMPLE_KEY).ok).toBe(true);
    const recovered = resolveExtensionNode(placeholder.node, lookup);
    expect(recovered.missing).toBe(false);
    expect(recovered.node.invalid).toBeUndefined();
    expect(recovered.node.props).toEqual(node.props);
  });

  it("STEP 15/16 — malformed input is handled without writes or loss", async () => {
    const before = db.rows("marketplace_installs").length;
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT, {
          kind: "plugin",
          fileName: "plugin.zip",
          bytes: new TextEncoder().encode("not a zip"),
          idempotencyKey: key(),
        }),
      ),
    ).toBe("zip.malformed");
    expect(db.rows("marketplace_installs")).toHaveLength(before);

    const ast = parseAst({
      main: [
        {
          id: "blank",
          type: "extension",
          widgetKey: "  ",
          props: { draft: true },
        },
      ],
    });
    const blank = ast.main[0]!;
    expect(blank.invalid).toBe(EXTENSION_MISSING_KEY);
    expect(blank.props).toEqual({ draft: true });
  });

  it("STEP 16/16 — incompatible builds fail closed with data intact", async () => {
    const before = db.rows("marketplace_installs").length;
    expect(
      await codeOf(
        installPackage(
          db.asClient(),
          MERCHANT,
          {
            kind: "plugin",
            fileName: "e2e-widgets.zip",
            bytes: fixtureZip({ ...manifestRaw, api: "^99.0.0" }),
            idempotencyKey: key(),
          },
          ACTOR,
        ),
      ),
    ).toBe("package.api_incompatible");
    expect(db.rows("marketplace_installs")).toHaveLength(before);

    const registry = seedSchemaRegistry();
    const miss = registry.resolveWidget(SIMPLE_KEY, {
      builderApi: "1.0.0",
      data: { headline: "kept" },
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("incompatible");
      expect(miss.missing.preservedData).toEqual({ headline: "kept" });
    }
  });
});
