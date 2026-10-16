/**
 * Frame30 Pass 2 — validated per-instance prop propagation (TDD).
 *
 * Canonical extension nodes carry per-instance `props`; the install's global
 * `settings` are a SEPARATE channel. This suite pins the full chain:
 * saved-page props → renderer (both trees) → PluginBlock → sandbox bridge
 * (isolated island) / Class B adapters (dressed) / theme components
 * (Level B sandbox). Globals are never substituted. Edit-A-renders-A-not-B
 * and survival across save/reload/preview/publish/storefront shapes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: (p: Record<string, unknown>) => {
      const { to, children, ...rest } = p as {
        to?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      return h(
        "a",
        { href: typeof to === "string" ? to : "/", ...rest },
        children as never,
      );
    },
  };
});

import { StudioWidget as StudioWidgetDirect } from "@/components/builder/studio/renderers";
import {
  SectionRenderer,
  type DevThemeBinding,
} from "@/components/builder/SectionRenderer";
import { PluginProvider } from "@/components/builder/PluginContext";
import { answerWidgetCall } from "@/components/marketplace/WidgetSandbox";
import { validateProps } from "@/lib/widget-props";
import {
  clearCommunityPresentations,
  registerCommunityPresentation,
  type CommunityPresentationProps,
} from "@/lib/plugin-theme-contract";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { fromDevThemeManifest } from "@/lib/dev-theme-widgets";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";
import {
  buildExtensionInsert,
  studioNodeForExtension,
  appBlockNodeForPlugin,
} from "@/components/builder/studio/plugin-tray";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import type { Section } from "@/lib/builder-ast";
import type { StudioNode } from "@/lib/studio/model";

const REVIEW_KEY = "plugin:acme/reviews";
const STARS_KEY = "plugin:acme/stars";
const THEME_WIDGET = "theme:aurora-lookbook/hero";

const FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Untitled", max: 20 },
  { key: "limit", label: "Limit", kind: "number", min: 1, max: 24, default: 5 },
] as unknown as WidgetDef["propsSchema"]["fields"];

function pluginDef(id: string): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [...FIELDS] },
    renderer: "sandbox",
  };
}

function installs(): InstalledPlugin[] {
  return [
    {
      installId: "install-acme",
      manifest: {
        id: "acme",
        name: "Acme",
        version: "1.2.0",
        api: "^3.0.0",
        permissions: ["render_storefront"],
        widgets: [
          {
            key: "reviews",
            label: "Reviews",
            slots: ["main"],
            entry: 'framique.mount("ACME-REVIEWS-P2")',
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
          },
          {
            key: "stars",
            label: "Stars",
            slots: ["main"],
            entry: 'framique.mount("ACME-STARS-P2")',
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
            themeable: { version: 1 as const, schema: "schema:ref" },
          },
        ],
        hooks: [],
        settings: [],
        i18n: { en: {}, bn: {} },
        budget: { jsKb: 10, mainThreadMs: 5 },
      },
      grantedScopes: ["render_storefront"],
      settings: { greeting: "Hello!", count: 3 } as InstalledPlugin["settings"],
      enabled: true,
    },
  ];
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function extSection(widgetKey: string, props: Record<string, unknown> = {}) {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: { kind: "plugin", id: widgetKey },
    widgetKey,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

function twin(
  widgetKey: string,
  props: Record<string, unknown> = {},
  reg?: UnifiedRegistry,
): StudioNode {
  const base =
    reg ?? registryWith([pluginDef(REVIEW_KEY), pluginDef(STARS_KEY)]);
  const built = buildExtensionInsert(base, {
    widgetKey,
    slot: "main",
    generateId: () => `p2-${widgetKey.replace(/[^a-z]/gi, "")}`,
  });
  if (!built.ok) {
    const fallback = appBlockNodeForPlugin(widgetKey);
    fallback.settings = {
      ...fallback.settings,
      ...props,
      extensionInstanceId: fallback.id,
      extensionApi: "3.1.0",
    };
    return fallback;
  }
  return studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...props },
  });
}

function renderRef(
  section: Section,
  plugins: InstalledPlugin[],
  opts: {
    registry?: UnifiedRegistry;
    themeKey?: string | null;
    binding?: DevThemeBinding;
    editing?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <SectionRenderer
        section={section}
        locale="en"
        editing={opts.editing ?? true}
        themeKey={opts.themeKey ?? null}
        registry={opts.registry}
        devThemeBinding={opts.binding}
      />
    </PluginProvider>,
  );
}

function renderTwin(
  node: StudioNode,
  plugins: InstalledPlugin[],
  opts: {
    registry?: UnifiedRegistry;
    themeKey?: string | null;
    binding?: DevThemeBinding;
    editing?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <StudioWidgetDirect
        node={node}
        device="desktop"
        editing={opts.editing ?? true}
        registry={opts.registry}
        themeKey={opts.themeKey}
        devThemeBinding={opts.binding}
      />
    </PluginProvider>,
  );
}

function themeBinding(): DevThemeBinding {
  return {
    assetOrigin: "https://themes-cdn.example.com",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: [],
    navigateAllowlist: [],
    onCall: () => Promise.resolve({ result: null }),
  };
}

function themeRegistry(): UnifiedRegistry {
  const verdict = fromDevThemeManifest({
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [],
    sections: [
      {
        key: "hero",
        slot: "main",
        component: "HeroCanvas",
        settings: [{ key: "kicker", label: "Kicker", type: "text" }],
      },
    ],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
  });
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture manifest refused");
  const reg = createWidgetRegistry();
  for (const def of verdict.defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

afterEach(() => {
  clearCommunityPresentations();
});

describe("Pass 2 — validated per-instance props propagate, globals never substitute", () => {
  it("isolated island carries validated instance props; settings bridge stays global-only", async () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const html = renderRef(
      extSection(REVIEW_KEY, { title: "Hello ext", unknownKey: "drop" }),
      installs(),
      {
        registry: reg,
      },
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("framique.props");
    expect(html).toContain("Hello ext");
    expect(html).not.toContain("unknownKey");
    // Globals never baked into the frame.
    expect(html).not.toContain("Hello!");
    const ans = await answerWidgetCall(
      { v: 1, id: "1", method: "plugin.settings" },
      {
        settings: { greeting: "Hello!", count: 3 },
        granted: ["render_storefront"],
        onCall: async () => ({ ok: true }),
      },
    );
    expect(ans).toEqual({ result: { greeting: "Hello!", count: 3 } });
    // Twin carries the same validated props through the same island.
    const twinHtml = renderTwin(
      twin(REVIEW_KEY, { title: "Hello ext", unknownKey: "drop" }, reg),
      installs(),
      {
        registry: reg,
      },
    );
    expect(twinHtml).toContain("Hello ext");
    expect(twinHtml).not.toContain("Hello!");
    expect(twinHtml).not.toContain("unknownKey");
  });

  it("Class B dressed adapters get instanceProps distinct from global data", () => {
    let seen: unknown = null;
    function Capture(
      props: CommunityPresentationProps & {
        instanceProps?: Record<string, unknown>;
      },
    ) {
      seen = props;
      return <p data-p2-stars="yes">{String(props.instanceProps?.title)}</p>;
    }
    registerCommunityPresentation("proof-alpha", STARS_KEY, Capture);
    const reg = registryWith([pluginDef(STARS_KEY)]);
    const html = renderRef(
      extSection(STARS_KEY, { title: "Great" }),
      installs(),
      {
        registry: reg,
        themeKey: "proof-alpha",
      },
    );
    expect(html).toContain("data-p2-stars");
    expect(html).toContain("Great");
    expect(html).not.toContain("<iframe");
    const captured = seen as {
      data: Record<string, unknown>;
      instanceProps: Record<string, unknown>;
    };
    expect(captured.data).toEqual({ greeting: "Hello!", count: 3 });
    expect(captured.instanceProps.title).toBe("Great");
    expect(captured.instanceProps).not.toHaveProperty("greeting");
    expect(captured.data).not.toHaveProperty("title");
  });

  it("Level B theme sandbox receives validated instance props, never globals", () => {
    const reg = themeRegistry();
    // Static markup pins the sandboxed frame (props ride the bridge document,
    // not the host DOM — so the assertion is frame + pinned URL + no leak).
    const html = renderRef(
      extSection(THEME_WIDGET, { kicker: "New drop", unknownKey: "dropped" }),
      [],
      { registry: reg, themeKey: "aurora-lookbook", binding: themeBinding() },
    );
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).toContain("<iframe");
    expect(html).toContain("/t/aurora-lookbook/1.0.0/");
    expect(html).not.toContain("HeroCanvas(");
    expect(html).not.toContain("unknownKey");
    const twinHtml = renderTwin(
      twin(THEME_WIDGET, { kicker: "New drop", unknownKey: "dropped" }, reg),
      [],
      {
        registry: reg,
        themeKey: "aurora-lookbook",
        binding: themeBinding(),
        editing: true,
      },
    );
    expect(twinHtml).not.toContain("Widget preview unavailable");
    expect(twinHtml).toContain("<iframe");
    expect(twinHtml).toContain("/t/aurora-lookbook/1.0.0/");
    expect(twinHtml).not.toContain("unknownKey");
    // Validation proof lives at the props layer (fail-closed before the frame).
    const def = reg.getWidget(THEME_WIDGET);
    expect(def?.propsSchema).toBeDefined();
    const clean = validateProps(def!.propsSchema!, {
      kicker: "New drop",
      unknownKey: "dropped",
    }).clean as Record<string, unknown>;
    expect(clean).not.toHaveProperty("unknownKey");
  });

  it("edit-A-renders-A-not-B: two instances stay independent after an edit", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const plugins = installs();
    const htmlA1 = renderRef(
      extSection(REVIEW_KEY, { title: "Alpha" }),
      plugins,
      { registry: reg },
    );
    const htmlB1 = renderRef(
      extSection(REVIEW_KEY, { title: "Beta" }),
      plugins,
      { registry: reg },
    );
    expect(htmlA1).toContain("Alpha");
    expect(htmlA1).not.toContain("Beta");
    expect(htmlB1).toContain("Beta");
    expect(htmlB1).not.toContain("Alpha");
    // Edit A: only A changes.
    const htmlA2 = renderRef(
      extSection(REVIEW_KEY, { title: "Alpha edited" }),
      plugins,
      { registry: reg },
    );
    const htmlB2 = renderRef(
      extSection(REVIEW_KEY, { title: "Beta" }),
      plugins,
      { registry: reg },
    );
    expect(htmlA2).toContain("Alpha edited");
    expect(htmlA2).not.toContain("Beta");
    expect(htmlB2).toContain("Beta");
    expect(htmlB2).not.toContain("Alpha edited");
    // Same independence in the studio tree.
    const twinA = renderTwin(
      twin(REVIEW_KEY, { title: "Alpha edited" }, reg),
      plugins,
      { registry: reg },
    );
    const twinB = renderTwin(
      twin(REVIEW_KEY, { title: "Beta" }, reg),
      plugins,
      { registry: reg },
    );
    expect(twinA).toContain("Alpha edited");
    expect(twinA).not.toContain("Beta");
    expect(twinB).toContain("Beta");
    expect(twinB).not.toContain("Alpha edited");
  });

  it("survives save/reload: JSON round-trip preserves validated props in both trees", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const saved = JSON.stringify(
      extSection(REVIEW_KEY, { title: "Persisted", limit: 7 }),
    );
    const reloaded = JSON.parse(saved) as Section;
    const refHtml = renderRef(reloaded, installs(), { registry: reg });
    expect(refHtml).toContain("Persisted");
    expect(refHtml).not.toContain("Widget preview unavailable");
    // Twin envelope survives the same round-trip.
    const savedTwin = JSON.stringify(
      twin(REVIEW_KEY, { title: "Persisted", limit: 7 }, reg),
    );
    const reloadedTwin = JSON.parse(savedTwin) as StudioNode;
    const twinHtml = renderTwin(reloadedTwin, installs(), { registry: reg });
    expect(twinHtml).toContain("Persisted");
    expect(twinHtml).not.toContain("Widget preview unavailable");
  });

  it("survives preview/publish/storefront shapes with the same instance props", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const node = extSection(REVIEW_KEY, { title: "Shape proof" });
    // Preview (editing) and publish (production) both render the island.
    const preview = renderRef(node, installs(), {
      registry: reg,
      editing: true,
    });
    const publish = renderRef(node, installs(), {
      registry: reg,
      editing: false,
    });
    for (const html of [preview, publish]) {
      expect(html).toContain("<iframe");
      expect(html).toContain("Shape proof");
    }
    // Storefront shape via ThemeChrome carries the same instance props.
    // The storefront host supplies installs via context (PluginProvider);
    // the route registry + binding ride as props.
    const storefront = renderToStaticMarkup(
      <PluginProvider plugins={installs()}>
        <ThemeChrome
          template="index"
          ast={{ header: [], main: [node], footer: [] } as never}
          tokens={{} as never}
          storeSlug="acme"
          themeKey={null}
          merchantId={null}
          siteKit={null}
          fallback={<div>fallback-body</div>}
          registry={reg}
        />
      </PluginProvider>,
    );
    expect(storefront).toContain("Shape proof");
    expect(storefront).toContain("<iframe");
    // Theme-owned storefront shape needs BOTH the route registry and binding.
    const themeReg = themeRegistry();
    const themeNode = extSection(THEME_WIDGET, { kicker: "Storefront theme" });
    const themeStorefront = renderToStaticMarkup(
      <PluginProvider plugins={[]}>
        <ThemeChrome
          template="index"
          ast={{ header: [], main: [themeNode], footer: [] } as never}
          tokens={{} as never}
          storeSlug="acme"
          themeKey="aurora-lookbook"
          merchantId={null}
          siteKit={null}
          fallback={<div>fallback-body</div>}
          registry={themeReg}
          devThemeBinding={themeBinding()}
        />
      </PluginProvider>,
    );
    expect(themeStorefront).not.toContain("Widget preview unavailable");
    expect(themeStorefront).toContain("<iframe");
  });
});
