/**
 * Frame30 Pass 1 — canvas+storefront renderer parity (TDD).
 *
 * The studio tree (StudioCanvas/StudioWidget) must resolve through the SAME
 * extension-aware outcomes as the reference branch (SectionRenderer extension
 * branch): native, official source-backed, isolated Class A, themeable
 * Class B, approved theme-owned sandbox. Placeholders ONLY for genuinely
 * missing/incompatible. Each test pairs the SAME node+registry in both
 * trees and asserts the SAME outcome (mode + validated props + render lane).
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioWidget } from "@/components/builder/studio/renderers";
import { resolveStudioExtension } from "@/components/builder/studio/renderers";
import {
  SectionRenderer,
  resolveExtensionForRender,
} from "@/components/builder/SectionRenderer";
import type { DevThemeBinding } from "@/components/builder/SectionRenderer";
import { PluginProvider } from "@/components/builder/PluginContext";
import {
  appBlockNodeForPlugin,
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
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
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import type { Section } from "@/lib/builder-ast";
import type { StudioNode } from "@/lib/studio/model";

const REVIEW_KEY = "plugin:acme/reviews";
const STARS_KEY = "plugin:acme/stars";
const OFFICIAL_KEY = "plugin:product-reviews/summary";
const THEME_WIDGET = "theme:aurora-lookbook/hero";

const FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Untitled", max: 20 },
  { key: "limit", label: "Limit", kind: "number", min: 1, max: 24, default: 5 },
] as unknown as WidgetDef["propsSchema"]["fields"];

function pluginDef(id: string, withSchema = false): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: ["main"],
    defaults: {},
    propsSchema: withSchema ? { fields: [...FIELDS] } : { fields: [] },
    renderer: "sandbox",
  };
}

function acmeInstalls(): InstalledPlugin[] {
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
            entry: 'framique.mount("ACME-REVIEWS-P1")',
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
          },
          {
            key: "stars",
            label: "Stars",
            slots: ["main"],
            entry: 'framique.mount("ACME-STARS-P1")',
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

function officialInstall(): InstalledPlugin[] {
  return [
    {
      installId: "install-official",
      manifest: {
        id: "product-reviews",
        name: "Reviews Test",
        version: "1.2.0",
        api: "^3.0.0",
        permissions: ["render_storefront"],
        widgets: [
          {
            key: "summary",
            label: "Summary",
            slots: ["main"],
            entry: 'framique.mount("OFFICIAL-SUMMARY-P1")',
            height: 200,
          },
        ],
        hooks: [],
        settings: [],
        i18n: { en: {}, bn: {} },
        budget: { jsKb: 10, mainThreadMs: 5 },
      },
      grantedScopes: ["render_storefront"],
      settings: {} as InstalledPlugin["settings"],
      enabled: true,
    },
  ];
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function canonical(
  widgetKey: string,
  props: Record<string, unknown> = {},
): Section {
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
    reg ??
    registryWith([pluginDef(REVIEW_KEY, true), pluginDef(STARS_KEY, true)]);
  const built = buildExtensionInsert(base, {
    widgetKey,
    slot: "main",
    generateId: () => `p1-${widgetKey.replace(/[^a-z]/gi, "")}`,
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

function renderStudio(
  node: StudioNode,
  plugins: InstalledPlugin[],
  opts: {
    registry?: UnifiedRegistry;
    themeKey?: string | null;
    binding?: DevThemeBinding;
  } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <StudioWidget
        node={node}
        device="desktop"
        editing
        registry={opts.registry}
        themeKey={opts.themeKey}
        devThemeBinding={opts.binding}
      />
    </PluginProvider>,
  );
}

function renderRef(
  section: Section,
  plugins: InstalledPlugin[],
  opts: {
    registry?: UnifiedRegistry;
    themeKey?: string | null;
    binding?: DevThemeBinding;
  } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <SectionRenderer
        section={section}
        locale="en"
        editing
        themeKey={opts.themeKey ?? null}
        registry={opts.registry}
        devThemeBinding={opts.binding}
      />
    </PluginProvider>,
  );
}

function themeBinding(over: Partial<DevThemeBinding> = {}): DevThemeBinding {
  return {
    assetOrigin: "https://themes-cdn.example.com",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: [],
    navigateAllowlist: [],
    onCall: () => Promise.resolve({ result: null }),
    ...over,
  };
}

function themeManifest(): Record<string, unknown> {
  return {
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
  };
}

function themeRegistry(): UnifiedRegistry {
  const verdict = fromDevThemeManifest(themeManifest());
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture manifest refused");
  const reg = createWidgetRegistry();
  for (const def of verdict.defs) {
    expect(reg.registerWidget(def).ok).toBe(true);
  }
  return reg;
}

afterEach(() => {
  clearCommunityPresentations();
});

describe("Pass 1 — same node+registry, same outcome in both trees", () => {
  it("native-builtin: same mode, same validated props, same content, no placeholder", () => {
    const props = { text: "Parity native" };
    const ref = resolveExtensionForRender(
      canonical("builtin:heading", props),
      null,
      undefined,
      {
        installedPlugins: [],
      },
    );
    const studio = resolveStudioExtension(
      twin("builtin:heading", props),
      null,
      undefined,
      [],
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (!ref?.ok || ref.mode !== "native-builtin") throw new Error("ref miss");
    if (!studio?.ok || studio.mode !== "native-builtin")
      throw new Error("studio miss");
    expect(studio.mode).toBe(ref.mode);
    expect(studio.props).toEqual(ref.props);
    const refHtml = renderRef(canonical("builtin:heading", props), []);
    const studioHtml = renderStudio(twin("builtin:heading", props), []);
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("Parity native");
      expect(html).not.toContain("Widget preview unavailable");
    }
  });

  it("official source-backed: same mode, both render the sandboxed island", () => {
    const reg = registryWith([pluginDef(OFFICIAL_KEY)]);
    const ref = resolveExtensionForRender(canonical(OFFICIAL_KEY), null, reg, {
      installedPlugins: officialInstall(),
    });
    const studio = resolveStudioExtension(
      twin(OFFICIAL_KEY, {}, reg),
      null,
      reg,
      officialInstall(),
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (!ref?.ok || ref.mode !== "official") throw new Error("ref miss");
    if (!studio?.ok || studio.mode !== "official")
      throw new Error("studio miss");
    const refHtml = renderRef(canonical(OFFICIAL_KEY), officialInstall(), {
      registry: reg,
    });
    const studioHtml = renderStudio(
      twin(OFFICIAL_KEY, {}, reg),
      officialInstall(),
      { registry: reg },
    );
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("<iframe");
      expect(html).toContain("Reviews Test");
      expect(html).not.toContain("Widget preview unavailable");
    }
    // Same bundle bytes ride the island in both trees.
    expect(refHtml).toContain("OFFICIAL-SUMMARY-P1");
    expect(studioHtml).toContain("OFFICIAL-SUMMARY-P1");
  });

  it("isolated Class A: same mode, same validated props, same island bytes", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const props = { title: "Isolated parity", unknownKey: "drop-me" };
    const ref = resolveExtensionForRender(
      canonical(REVIEW_KEY, props),
      null,
      reg,
      {
        installedPlugins: acmeInstalls(),
      },
    );
    const studio = resolveStudioExtension(
      twin(REVIEW_KEY, props, reg),
      null,
      reg,
      acmeInstalls(),
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (!ref?.ok || ref.mode !== "plugin-isolated") throw new Error("ref miss");
    if (!studio?.ok || studio.mode !== "plugin-isolated")
      throw new Error("studio miss");
    expect(studio.props).toEqual(ref.props);
    expect(studio.props).not.toHaveProperty("unknownKey");
    const refHtml = renderRef(canonical(REVIEW_KEY, props), acmeInstalls(), {
      registry: reg,
    });
    const studioHtml = renderStudio(
      twin(REVIEW_KEY, props, reg),
      acmeInstalls(),
      { registry: reg },
    );
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("<iframe");
      expect(html).toContain("Isolated parity");
      expect(html).not.toContain("unknownKey");
    }
    // Island parity: the studio island is the reference island minus chrome.
    expect(refHtml).toContain(studioHtml);
  });

  it("themeable Class B dressed: same mode, both render the theme presentation, bundle never executes", () => {
    function Capture(
      props: CommunityPresentationProps & {
        instanceProps?: Record<string, unknown>;
      },
    ) {
      return <p data-p1-stars="yes">{String(props.instanceProps?.title)}</p>;
    }
    registerCommunityPresentation("proof-alpha", STARS_KEY, Capture);
    const reg = registryWith([pluginDef(STARS_KEY, true)]);
    const props = { title: "Dressed parity" };
    const ref = resolveExtensionForRender(
      canonical(STARS_KEY, props),
      "proof-alpha",
      reg,
      {
        installedPlugins: acmeInstalls(),
      },
    );
    const studio = resolveStudioExtension(
      twin(STARS_KEY, props, reg),
      "proof-alpha",
      reg,
      acmeInstalls(),
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (!ref?.ok || ref.mode !== "plugin-themeable")
      throw new Error("ref miss");
    if (!studio?.ok || studio.mode !== "plugin-themeable")
      throw new Error("studio miss");
    expect(studio.props).toEqual(ref.props);
    const refHtml = renderRef(canonical(STARS_KEY, props), acmeInstalls(), {
      registry: reg,
      themeKey: "proof-alpha",
    });
    const studioHtml = renderStudio(
      twin(STARS_KEY, props, reg),
      acmeInstalls(),
      {
        registry: reg,
        themeKey: "proof-alpha",
      },
    );
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("data-p1-stars");
      expect(html).toContain("Dressed parity");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("ACME-STARS-P1");
    }
  });

  it("themeable Class B undressed: same mode, both fall back to the same island", () => {
    const reg = registryWith([pluginDef(STARS_KEY, true)]);
    const props = { title: "Undressed parity" };
    const ref = resolveExtensionForRender(
      canonical(STARS_KEY, props),
      "proof-plain",
      reg,
      {
        installedPlugins: acmeInstalls(),
      },
    );
    const studio = resolveStudioExtension(
      twin(STARS_KEY, props, reg),
      "proof-plain",
      reg,
      acmeInstalls(),
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (!ref?.ok || ref.mode !== "plugin-themeable")
      throw new Error("ref miss");
    if (!studio?.ok || studio.mode !== "plugin-themeable")
      throw new Error("studio miss");
    const refHtml = renderRef(canonical(STARS_KEY, props), acmeInstalls(), {
      registry: reg,
      themeKey: "proof-plain",
    });
    const studioHtml = renderStudio(
      twin(STARS_KEY, props, reg),
      acmeInstalls(),
      {
        registry: reg,
        themeKey: "proof-plain",
      },
    );
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("<iframe");
      expect(html).toContain("Undressed parity");
    }
    expect(refHtml).toContain(studioHtml);
  });

  it("approved theme-owned sandbox: bound renders the same pinned frame in both trees; unbound keeps the same placeholder", () => {
    const reg = themeRegistry();
    const props = { kicker: "Sandbox parity" };
    const boundRef = renderRef(canonical(THEME_WIDGET, props), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding(),
    });
    const boundStudio = renderStudio(twin(THEME_WIDGET, props, reg), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding(),
    });
    for (const html of [boundRef, boundStudio]) {
      expect(html).not.toContain("Widget preview unavailable");
      expect(html).toContain("<iframe");
      expect(html).toContain("/t/aurora-lookbook/1.0.0/");
      expect(html).not.toContain("HeroCanvas(");
    }
    const unboundRef = renderRef(canonical(THEME_WIDGET, props), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
    });
    const unboundStudio = renderStudio(twin(THEME_WIDGET, props, reg), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
    });
    for (const html of [unboundRef, unboundStudio]) {
      expect(html).toContain("Widget preview unavailable");
      expect(html).not.toContain("<iframe");
    }
  });

  it("genuinely missing/incompatible: same miss, same explicit placeholder in both trees", () => {
    const reg = registryWith([]);
    const missingRef = resolveExtensionForRender(
      canonical("plugin:ghost/missing"),
      null,
      reg,
      {
        installedPlugins: [],
      },
    );
    const missingStudio = resolveStudioExtension(
      twin("plugin:ghost/missing", {}, reg),
      null,
      reg,
      [],
    );
    expect(missingRef?.ok).toBe(false);
    expect(missingStudio?.ok).toBe(false);
    expect(missingStudio).toEqual(missingRef);
    const refHtml = renderRef(canonical("plugin:ghost/missing"), [], {
      registry: reg,
    });
    const studioHtml = renderStudio(twin("plugin:ghost/missing", {}, reg), [], {
      registry: reg,
    });
    for (const html of [refHtml, studioHtml]) {
      expect(html).toContain("Widget preview unavailable");
      expect(html).not.toContain("<iframe");
    }
    // Foreign theme-owned is recoverable-fallback in both trees, never cross-owner.
    const foreignReg = themeRegistry();
    const foreignRef = resolveExtensionForRender(
      canonical(THEME_WIDGET, { kicker: "Hi" }),
      "songoskriti",
      foreignReg,
      {
        installedPlugins: [],
      },
    );
    const foreignStudio = resolveStudioExtension(
      twin(THEME_WIDGET, { kicker: "Hi" }, foreignReg),
      "songoskriti",
      foreignReg,
      [],
    );
    expect(foreignRef?.ok).toBe(true);
    expect(foreignStudio?.ok).toBe(true);
    if (foreignRef?.ok && foreignRef.mode === "theme-owned") {
      expect(foreignRef.presentation).toBe("recoverable-fallback");
    } else throw new Error("ref foreign miss");
    if (foreignStudio?.ok && foreignStudio.mode === "theme-owned") {
      expect(foreignStudio.presentation).toBe("recoverable-fallback");
    } else throw new Error("studio foreign miss");
  });
});
