/**
 * Frame30 Pass 3 — adversarial extension rendering (TDD).
 *
 * Hostile/unserializable props, missing defs mid-render, disabled/suspended
 * mid-session, binding mismatch/version skew → all fail-closed with explicit
 * states in BOTH trees (studio twin + reference branch). Never a crash,
 * never another owner's component, never silent substitution.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StudioWidget,
  resolveStudioExtension,
} from "@/components/builder/studio/renderers";
import {
  SectionRenderer,
  resolveExtensionForRender,
  type DevThemeBinding,
} from "@/components/builder/SectionRenderer";
import { PluginProvider } from "@/components/builder/PluginContext";
import { validateInstanceProps } from "@/components/marketplace/WidgetSandbox";
import {
  buildExtensionInsert,
  studioNodeForExtension,
  appBlockNodeForPlugin,
} from "@/components/builder/studio/plugin-tray";
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

function installs(over: Partial<InstalledPlugin> = {}): InstalledPlugin[] {
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
            entry: 'framique.mount("ACME-REVIEWS-P3")',
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
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
      ...over,
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
  const base = reg ?? registryWith([pluginDef(REVIEW_KEY)]);
  const built = buildExtensionInsert(base, {
    widgetKey,
    slot: "main",
    generateId: () => `p3-${widgetKey.replace(/[^a-z]/gi, "")}`,
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
      <StudioWidget
        node={node}
        device="desktop"
        editing={opts.editing}
        registry={opts.registry}
        themeKey={opts.themeKey}
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

describe("Pass 3 — adversarial inputs fail closed with explicit states", () => {
  it("hostile props are neutralized at the boundary in both trees", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"x":1},"title":"<script>alert(1)</script>Hi","unknownKey":"drop"}',
    );
    const refHtml = renderRef(canonical(REVIEW_KEY, hostile), installs(), {
      registry: reg,
    });
    const twinHtml = renderTwin(twin(REVIEW_KEY, hostile, reg), installs(), {
      registry: reg,
    });
    for (const html of [refHtml, twinHtml]) {
      expect(html).toContain("Hi");
      expect(html).not.toContain("alert(1)");
      expect(html).not.toContain("unknownKey");
      expect(html).toContain("<iframe");
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Resolution-level parity: unknown/hostile keys stripped identically.
    const ref = resolveExtensionForRender(
      canonical(REVIEW_KEY, hostile),
      null,
      reg,
      {
        installedPlugins: installs(),
      },
    );
    const studio = resolveStudioExtension(
      twin(REVIEW_KEY, hostile, reg),
      null,
      reg,
      installs(),
    );
    expect(ref?.ok).toBe(true);
    expect(studio?.ok).toBe(true);
    if (ref?.ok && studio?.ok) {
      expect(studio.props).toEqual(ref.props);
      expect(studio.props).not.toHaveProperty("__proto__");
    }
  });

  it("unserializable payloads (circular/bigint/functions) fail closed, never throw", () => {
    const circular: Record<string, unknown> = { title: "x" };
    (circular as Record<string, unknown>).self = circular;
    expect(validateInstanceProps(circular, { fields: [] })).toEqual({});
    expect(validateInstanceProps({ big: 10n }, { fields: [] })).toEqual({});
    expect(
      validateInstanceProps(
        { title: "ok", fn: () => {}, sym: Symbol("s"), u: undefined },
        { fields: [] },
      ),
    ).toEqual({ title: "ok" });
    // Both trees survive a hostile twin bag without throwing.
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const hostileTwin: StudioNode = {
      id: "hostile-1",
      el: "app-block",
      settings: {
        pluginKey: REVIEW_KEY,
        extensionInstanceId: "hostile-1",
        extensionApi: "3.1.0",
        title: "ok",
      },
    };
    // A getter that throws must not break resolution (fail-closed null or miss).
    Object.defineProperty(hostileTwin.settings, "evil", {
      enumerable: true,
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() =>
      resolveStudioExtension(hostileTwin, null, reg, installs()),
    ).not.toThrow();
    expect(() =>
      renderTwin(hostileTwin, installs(), { registry: reg }),
    ).not.toThrow();
  });

  it("missing defs mid-render: both trees flip from island to the explicit placeholder", () => {
    const full = registryWith([pluginDef(REVIEW_KEY)]);
    const empty = registryWith([]);
    const before = renderRef(
      canonical(REVIEW_KEY, { title: "Before" }),
      installs(),
      { registry: full },
    );
    expect(before).toContain("<iframe");
    const afterRef = renderRef(
      canonical(REVIEW_KEY, { title: "Before" }),
      installs(),
      { registry: empty },
    );
    const afterTwin = renderTwin(
      twin(REVIEW_KEY, { title: "Before" }, full),
      installs(),
      { registry: empty, editing: true },
    );
    for (const html of [afterRef, afterTwin]) {
      expect(html).toContain("Widget preview unavailable");
      expect(html).not.toContain("<iframe");
    }
    // Production (non-editing) renders null/empty, never a crash.
    const prodRef = renderRef(
      canonical(REVIEW_KEY, { title: "Before" }),
      installs(),
      {
        registry: empty,
        editing: false,
      },
    );
    const prodTwin = renderTwin(
      twin(REVIEW_KEY, { title: "Before" }, full),
      installs(),
      {
        registry: empty,
        editing: false,
      },
    );
    expect(prodRef).toBe("");
    expect(prodTwin).toBe("");
  });

  it("disabled mid-session: island flips to the explicit disabled state, never the bundle", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const before = renderRef(
      canonical(REVIEW_KEY, { title: "Hi" }),
      installs(),
      { registry: reg },
    );
    expect(before).toContain("<iframe");
    const disabled = installs({ enabled: false });
    const refHtml = renderRef(
      canonical(REVIEW_KEY, { title: "Hi" }),
      disabled,
      { registry: reg },
    );
    const twinHtml = renderTwin(
      twin(REVIEW_KEY, { title: "Hi" }, reg),
      disabled,
      { registry: reg, editing: true },
    );
    for (const html of [refHtml, twinHtml]) {
      expect(html).toContain("switched off");
      expect(html).not.toContain("<iframe");
    }
  });

  it("suspended mid-session: explicit suspended state, distinct from disabled, never the bundle", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const suspended = installs({ suspended: true });
    const refHtml = renderRef(
      canonical(REVIEW_KEY, { title: "Hi" }),
      suspended,
      { registry: reg },
    );
    const twinHtml = renderTwin(
      twin(REVIEW_KEY, { title: "Hi" }, reg),
      suspended,
      { registry: reg, editing: true },
    );
    for (const html of [refHtml, twinHtml]) {
      expect(html).not.toContain("<iframe");
      // Explicit platform-suspension state — never the generic unselected label.
      expect(html).not.toContain("No app widget selected");
      expect(html.toLowerCase()).toContain("suspend");
    }
    // Disabled and suspended are distinct explicit states.
    const disabledHtml = renderRef(
      canonical(REVIEW_KEY, { title: "Hi" }),
      installs({ enabled: false }),
      {
        registry: reg,
      },
    );
    expect(disabledHtml).toContain("switched off");
    expect(refHtml).not.toBe(disabledHtml);
  });

  it("binding mismatch and version skew keep the explicit placeholder in both trees", () => {
    const reg = themeRegistry();
    const props = { kicker: "Hi" };
    const mismatched = renderRef(canonical(THEME_WIDGET, props), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding({
        theme: { name: "other-theme", version: "1.0.0" },
      }),
    });
    const skewed = renderTwin(twin(THEME_WIDGET, props, reg), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding({
        theme: { name: "aurora-lookbook", version: "9.9.9" },
      }),
      editing: true,
    });
    for (const html of [mismatched, skewed]) {
      expect(html).toContain("Widget preview unavailable");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("HeroCanvas(");
    }
    // Bad origin binding is equally fail-closed (no frame, no theme code —
    // the frame document never mounts; the host wrapper stays empty).
    const badOrigin = renderRef(canonical(THEME_WIDGET, props), [], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding({ assetOrigin: "http://evil.example" }),
    });
    expect(badOrigin).not.toContain("<iframe");
    expect(badOrigin).not.toContain("HeroCanvas(");
  });

  it("incompatible builder API stays fail-closed with an explicit state in both trees", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const future = installs();
    future[0]!.manifest.api = "^99.0.0";
    const refHtml = renderRef(canonical(REVIEW_KEY, { title: "Hi" }), future, {
      registry: reg,
    });
    const twinHtml = renderTwin(
      twin(REVIEW_KEY, { title: "Hi" }, reg),
      future,
      { registry: reg },
    );
    for (const html of [refHtml, twinHtml]) {
      expect(html).not.toContain("<iframe");
      // Explicit incompatibility — never silent, never the bundle.
      expect(html.length).toBeGreaterThan(0);
    }
    expect(refHtml).toContain("compatible");
    expect(twinHtml).toContain("compatible");
  });
});
