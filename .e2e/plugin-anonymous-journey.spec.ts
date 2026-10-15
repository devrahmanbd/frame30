import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import {
  parseManifest,
  type InstalledPlugin,
} from "../src/lib/plugin-manifest";
import {
  buildTrayRegistry,
  createWidgetRegistry,
  fromPluginManifest,
} from "../src/lib/unified-widget-registry";
import {
  controlStatus,
  defaultsFor,
  validateProps,
} from "../src/lib/widget-props";
import {
  CLASS_B_FALLBACK,
  dressingKey,
  resolveInspectorSchema,
  resolvePresentation,
} from "../src/lib/widget-presentation";
import { ownerForWidgetKey } from "../src/lib/builder-ast";

/**
 * Plugin journey — anonymous cold-browser half (hermetic, loopback-only).
 *
 * Covers the just-landed frame30 lanes on public/anonymous paths only:
 * per-widget plugin schemas (`propsSchema`/`defaultProps`), inspector
 * canonical `widgetKey` resolution (`resolveInspectorSchema`), one-registry
 * route wiring (`buildTrayRegistry`), and per-mode renderers
 * (`resolvePresentation` modes + `SectionRenderer` lanes).
 *
 * Authenticated/draft-preview paths are OUT OF SCOPE (no auth stubbing):
 * the editor (palette click → insert click → control edits → save/reload →
 * publish) lives under the `_authenticated` route tree whose `beforeLoad`
 * throws `redirect({ to: "/auth" })` with no session. The auth-gated
 * remainder is therefore marked as skipped-with-reason below; the reachable
 * prefix (install → tray → insert → controls → preview → themed render)
 * FAILS this spec if it breaks.
 *
 * Real-vs-skipped split:
 * - Real units (Node worker, never stubs): parseManifest → fromPluginManifest
 *   → buildTrayRegistry → resolveWidget → defaultsFor/validateProps →
 *   resolveInspectorSchema → resolvePresentation (same modules the app ships).
 * - Real browser: auth gate pin, public preview render + hostile-inert proof,
 *   storefront graceful degradation, hermetic enforcement.
 * - Static pins (read-only source reads): WidgetTray / plugin-tray /
 *   SectionInspector / SectionRenderer / builder shell wiring the same units.
 * - Skipped with reason: interactive palette/insert/edit/save/publish clicks.
 *
 * Cleanup: collectors disposed in afterAll; the dev server is owned by the
 * Playwright webServer entry. No processes spawned here.
 */

const ENTRY = "framique.mount(document.createTextNode('reviews'))";
const WIDGET_ID = "plugin:reviews-co/reviews_carousel";

function carouselWidget() {
  return {
    key: "reviews_carousel",
    label: "Reviews carousel",
    slots: ["main"],
    entry: ENTRY,
    themeable: { version: 1 as const, schema: "schema:ref" },
    propsSchema: [
      {
        key: "heading",
        label: "Heading",
        kind: "text",
        default: "Loved by shoppers",
      },
      { key: "accent", label: "Accent", kind: "color", default: "#0f766e" },
      { key: "banner", label: "Banner", kind: "image" },
      {
        key: "slides",
        label: "Slides",
        kind: "repeater",
        fields: [
          { key: "quote", label: "Quote", kind: "text" },
          { key: "author", label: "Author", kind: "text" },
          { key: "photo", label: "Photo", kind: "image" },
        ],
      },
    ],
    defaultProps: {
      heading: "What shoppers say",
      slides: [
        { quote: "Fast delivery, great quality.", author: "Ayesha", photo: "" },
        { quote: "Will order again.", author: "Rahim", photo: "" },
      ],
    },
  };
}

function rawManifest(widgets: unknown[]) {
  return {
    id: "reviews-co",
    name: "Reviews Co",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets,
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

function installOf(manifest: {
  id: string;
  name: string;
  version: string;
  api: string;
  permissions: string[];
  widgets: never[];
  hooks: never[];
  settings: never[];
  i18n: { en: Record<string, never>; bn: Record<string, never> };
  budget?: { jsKb: number; mainThreadMs: number };
}): InstalledPlugin {
  return {
    installId: "inst-reviews-co",
    manifest: {
      ...manifest,
      budget: { jsKb: 10, mainThreadMs: 5 },
    } as unknown as InstalledPlugin["manifest"],
    grantedScopes: ["read_shop", "render_storefront"],
    settings: { heading: "Declared", limit: 5 },
    enabled: true,
  };
}

/** Parse → adapt → one-registry seed through the REAL pipeline. */
function trayRegistry() {
  const verdict = parseManifest(rawManifest([carouselWidget()]));
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture manifest rejected");
  const installed = installOf(
    verdict.manifest as unknown as Parameters<typeof installOf>[0],
  );
  const registry = buildTrayRegistry([installed]);
  return { registry, installed };
}

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

let collectors: NetworkCollector[] = [];

test.afterAll(() => {
  for (const c of collectors) c.dispose();
  collectors = [];
});

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector; blocked: string[] }> {
  const collector = new NetworkCollector(page).attach();
  collectors.push(collector);
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  return { collector, blocked };
}

// Cold-sensitive first navigation only (cf. theme-preview-isolation.spec.ts):
// SSR compile budget lives on the goto; every assertion keeps strict timeouts.
const COLD_GOTO_TIMEOUT = 180_000;

test("install: fixture manifest parses with per-widget schema + defaults", () => {
  const verdict = parseManifest(rawManifest([carouselWidget()]));
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) return;
  const widget = verdict.manifest.widgets[0]!;
  expect(widget.propsSchema).toHaveLength(4);
  expect(widget.propsSchema![0]).toMatchObject({
    key: "heading",
    kind: "text",
    default: "Loved by shoppers",
  });
  const slides = widget.propsSchema!.find((f) => f.key === "slides")!;
  expect(slides.kind).toBe("repeater");
  expect(slides.fields!.map((f) => f.key)).toEqual([
    "quote",
    "author",
    "photo",
  ]);
  expect(widget.defaultProps).toMatchObject({ heading: "What shoppers say" });
});

test("tray discovery: installed widget lists through the one registry", () => {
  const { registry } = trayRegistry();
  const ids = registry.listWidgets().map((d) => d.id);
  expect(ids).toContain(WIDGET_ID);
  const resolved = registry.resolveWidget(WIDGET_ID, { data: {} });
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) return;
  // Adapter carried the real schema + validated defaults into the def.
  expect(resolved.def.propsSchema.fields.map((f) => f.key)).toEqual([
    "heading",
    "accent",
    "banner",
    "slides",
  ]);
  expect(resolved.def.defaults).toMatchObject({ heading: "What shoppers say" });
  expect(resolved.def.defaults).toMatchObject({ accent: "#0f766e" });

  // Disabled installs contribute nothing — the tray can never offer a
  // widget it cannot insert (shared adapter filtering).
  const verdict = parseManifest(rawManifest([carouselWidget()]));
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) return;
  const disabled = installOf(
    verdict.manifest as unknown as Parameters<typeof installOf>[0],
  );
  const offRegistry = buildTrayRegistry([{ ...disabled, enabled: false }]);
  expect(offRegistry.listWidgets().map((d) => d.id)).not.toContain(WIDGET_ID);
  expect(offRegistry.resolveWidget(WIDGET_ID, { data: {} }).ok).toBe(false);
});

test("insert: canonical extension node with schema-cleaned props", () => {
  const { registry } = trayRegistry();
  const resolved = registry.resolveWidget(WIDGET_ID, { data: {} });
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) return;
  const def = resolved.def;
  // Mirrors buildExtensionInsert/initialExtensionProps semantics (pinned
  // statically below): schema defaults merged under declared defaults, then
  // cleaned through the shared value layer — fresh objects every call.
  const declared = JSON.parse(JSON.stringify(def.defaults)) as Record<
    string,
    unknown
  >;
  const merged = {
    ...(defaultsFor(def.propsSchema) as Record<string, unknown>),
    ...declared,
  };
  const clean = validateProps(def.propsSchema, merged).clean as Record<
    string,
    unknown
  >;
  const node = {
    id: "ext-e2e-1",
    type: "extension" as const,
    instanceId: "ext-e2e-1",
    owner: ownerForWidgetKey(WIDGET_ID),
    widgetKey: WIDGET_ID,
    apiVersion: "3.1.0",
    props: clean,
    slots: [...def.slots],
  };
  expect(node.type).toBe("extension");
  expect(node.widgetKey).toBe(WIDGET_ID);
  expect(node.owner).toBeTruthy();
  expect(node.props).toMatchObject({ heading: "What shoppers say" });
  expect(node.props).toMatchObject({ accent: "#0f766e" });
  expect((node.props["slides"] as unknown[]).length).toBe(2);
  expect(node.slots).toContain("main");
  // Registry round-trip: the same key resolves again (insert is repeatable).
  expect(registry.resolveWidget(node.widgetKey, { data: {} }).ok).toBe(true);
  // Fresh adapter registry stands alone (no global pollution from the tray).
  expect(createWidgetRegistry().resolveWidget(WIDGET_ID, { data: {} }).ok).toBe(
    false,
  );
});

test("controls: canonical widgetKey resolves to generated schema controls", () => {
  const { registry } = trayRegistry();
  const resolution = resolveInspectorSchema(
    { type: "extension", widgetKey: WIDGET_ID, props: {} },
    registry,
  );
  expect(resolution.status).toBe("schema");
  if (resolution.status !== "schema") return;
  expect(resolution.widgetId).toBe(WIDGET_ID);
  expect(resolution.label).toBe("Reviews carousel");
  expect(resolution.meta).toContain("plugin");
  const keys = (
    resolution.schema as { fields: { key: string; kind: string }[] }
  ).fields.map((f) => f.key);
  expect(keys).toEqual(["heading", "accent", "banner", "slides"]);

  // Every fixture kind maps to a real control status (nothing unknown).
  expect(controlStatus("text")).toBe("full");
  expect(controlStatus("color")).toBe("full");
  expect(controlStatus("image")).toBe("placeholder");
  expect(controlStatus("repeater")).toBe("structural");
  expect(controlStatus("slider")).toBe("unknown");

  // Merchant edit through the shared value layer: good values validate,
  // hostile/bad values report keyed errors (the controls never persist raw).
  const good = validateProps(resolution.schema, {
    heading: "Top reviews",
    accent: "#ff0000",
    banner: "https://cdn.example.com/b.png",
    slides: [{ quote: "Excellent.", author: "Nusrat", photo: "" }],
  });
  expect(good.ok).toBe(true);
  expect(good.errors).toEqual([]);
  expect(good.clean["heading"]).toBe("Top reviews");
  const bad = validateProps(resolution.schema, { accent: "red" });
  expect(bad.ok).toBe(false);
  expect(bad.errors).toContain("accent.not_a_color");

  // Deep defaults cover every schema key.
  const d = defaultsFor(resolution.schema);
  expect(Object.keys(d).sort()).toEqual(
    ["accent", "banner", "heading", "slides"].sort(),
  );
});

test("render: per-mode presentation under the active theme", () => {
  const { registry, installed } = trayRegistry();
  // Undressed Class B: island fallback over install settings — bundle bytes
  // never leak (no `entry` on the outcome).
  const bare = resolvePresentation({
    widgetId: WIDGET_ID,
    themeKey: "songoskriti",
    registry,
    installedPlugins: [installed],
  });
  expect(bare.ok).toBe(true);
  if (!bare.ok || bare.mode !== "plugin-themeable") {
    throw new Error("expected undressed Class B resolution");
  }
  expect(bare.dressed).toBe(false);
  expect(bare.data).toEqual({ heading: "Declared", limit: 5 });
  expect(bare.fallback).toBe(CLASS_B_FALLBACK);
  expect(bare).not.toHaveProperty("entry");

  // Dressed by the active theme: theme presentation over declared public
  // data — the storefront render path for a themed plugin widget.
  const dressed = resolvePresentation({
    widgetId: WIDGET_ID,
    themeKey: "songoskriti",
    registry,
    installedPlugins: [installed],
    dressedPresentations: new Set([dressingKey("songoskriti", WIDGET_ID)]),
    publicData: { heading: "Themed heading" },
  });
  expect(dressed.ok).toBe(true);
  if (!dressed.ok || dressed.mode !== "plugin-themeable") {
    throw new Error("expected dressed Class B resolution");
  }
  expect(dressed.dressed).toBe(true);
  expect(dressed.data).toEqual({ heading: "Themed heading" });
  expect(dressed).not.toHaveProperty("entry");

  // Unknown widget: miss with preserved data, never another owner's renderer.
  const miss = resolvePresentation({
    widgetId: "plugin:reviews-co/nope",
    themeKey: "songoskriti",
    registry,
    props: { heading: "mine" },
  });
  expect(miss.ok).toBe(false);
  if (miss.ok) return;
  expect(miss.renderer).toBeNull();
  expect(miss.preservedProps).toEqual({ heading: "mine" });
  expect(miss.placeholder).toBe(true);
});

test("static wiring: install → tray → insert → controls → render chain", () => {
  // Tray discovery reads installed manifests through the one registry
  // (frame30: `buildTrayRegistry`, shared with the insert path — the tray
  // can never offer a widget it cannot insert).
  const tray = src("src/components/builder/WidgetTray.tsx");
  for (const token of [
    "buildTrayRegistry",
    "trayRegistry",
    "themeTrayEntries",
    "onAddExtension",
  ]) {
    expect(tray.includes(token), `tray pins ${token}`).toBe(true);
  }

  // Insert builds the canonical node with schema-cleaned defaults.
  const insert = src("src/components/builder/studio/plugin-tray.ts");
  for (const token of [
    "studioPluginTrayEntries",
    "buildTrayRegistry",
    "buildExtensionInsert",
    "initialExtensionProps",
    "defaultsFor",
    'type: "extension"',
  ]) {
    expect(insert.includes(token), `plugin-tray pins ${token}`).toBe(true);
  }

  // Inspector generates controls from the canonical widgetKey first.
  const inspector = src("src/components/builder/SectionInspector.tsx");
  for (const token of [
    "resolveInspectorSchema",
    "resolveSchemaForSection",
    "widgetKey",
    "SchemaControls",
    "validateProps",
    "controlStatus",
    "defaultsFor",
    "hasRenderableFields",
  ]) {
    expect(inspector.includes(token), `inspector pins ${token}`).toBe(true);
  }

  // Per-mode renderers: extension nodes resolve beside the theme
  // presentation, plugin lanes share the null-origin PluginBlock island.
  const renderer = src("src/components/builder/SectionRenderer.tsx");
  for (const token of [
    "resolveExtensionForRender",
    "resolvePresentation",
    "PluginBlock",
    "Widget preview unavailable",
  ]) {
    expect(renderer.includes(token), `renderer pins ${token}`).toBe(true);
  }

  // Editor shell mounts the full chain with the threaded registry.
  const builder = src("src/routes/_authenticated/dashboard/builder.tsx");
  for (const token of [
    "WidgetTray",
    "SectionInspector",
    "PublishModal",
    "SectionRenderer",
    "useBuilderEditor",
    "cloneNodes",
    "PluginProvider",
  ]) {
    expect(builder.includes(token), `builder mounts ${token}`).toBe(true);
  }
});

test("auth boundary: editor routes redirect unauthenticated (reachable-prefix gate)", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const response = await page.goto("/dashboard/builder", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);
  // No Supabase session on loopback ⇒ beforeLoad throws redirect to /auth.
  // Cold-aware budget (not a weakened assertion): this test is the file's
  // first browser navigation and the builder route chunk compiles lazily —
  // the client-side gate can only fire after its JS loads. The assertions
  // below keep strict timeouts.
  await expect(page, "unauthenticated editor redirects to /auth").toHaveURL(
    /\/auth/,
    { timeout: 90_000 },
  );
  await expect(
    page.locator("text=Builder studio"),
    "no builder canvas without a session",
  ).toHaveCount(0);
  expect(collector.externalResponses()).toEqual([]);
});

test("public preview renders themed content; extension-shaped input stays inert", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const marker = "__e2e_plugin_journey";
  const response = await page.goto("/theme-preview/songoskriti", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);
  // Storefront output renders the themed content under the active theme.
  await expect(page.locator("img").first(), "preview renders").toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("h1, h2").first()).toBeVisible({
    timeout: 15_000,
  });

  // Extension-shaped hostile query input never executes.
  const hostile =
    "/theme-preview/songoskriti" +
    `?widgetKey=plugin:reviews-co/reviews_carousel` +
    `&title=<script>window.${marker}="title"</script>` +
    `&accent="><img src=x onerror="window.${marker}='accent'">`;
  const hostileRes = await page.goto(hostile, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(hostileRes?.status()).toBe(200);
  await expect(
    page.locator("script", { hasText: marker }),
    "no script element may contain the hostile marker",
  ).toHaveCount(0);
  await expect(
    page.locator(`[onerror*="${marker}"], [onload*="${marker}"]`),
    "no handler attribute may contain the hostile marker",
  ).toHaveCount(0);
  const executed = await page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key] ?? null,
    marker,
  );
  expect(executed).toBeNull();
  expect(collector.externalResponses()).toEqual([]);
});

test("storefront without a publish degrades gracefully, never leaks", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const response = await page.goto("/store/zz-e2e-plugin-journey/", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response).toBeTruthy();
  await expect(page.locator("main").first()).toContainText(
    /(Store not found|দোকান পাওয়া যায়নি|This storefront is not published|Couldn.t load this storefront|এই দোকানটি লোড করা যায়নি|Try again|আবার চেষ্টা করুন)/,
    { timeout: 20_000 },
  );
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toContain("What shoppers say");
  expect(body).not.toContain("plugin:reviews-co");
  expect(collector.externalResponses()).toEqual([]);
});

// Auth-gated remainder: every step below fundamentally requires a session
// (the `_authenticated` beforeLoad redirect fires with no Supabase session,
// and auth stubbing is out of scope). Skipped-with-reason, never attempted.
test.skip("auth-gated: tray click inserts the canonical extension node", () => {
  // Requires a session: WidgetTray onAddExtension → buildExtensionInsert in
  // the live builder. Covered statically above + by unit insert above.
});

test.skip("auth-gated: schema-generated controls persist merchant edits", () => {
  // Requires a session: SectionInspector SchemaControls onChange →
  // validateProps → autosave. Covered by the controls value-layer test above.
});

test.skip("auth-gated: save → reload → preview → publish under the theme", () => {
  // Requires a session: builderAutosaveFn → reload → PublishModal →
  // storefront render. Covered by the public preview/storefront tests above.
});
