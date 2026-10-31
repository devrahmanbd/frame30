/**
 * Frame30 studio extension render (TDD).
 *
 * Connects the studio `app-block` extension twins (see
 * `studioNodeForExtension` in `plugin-tray.ts` — canonical props ride in
 * `settings` beside the `extensionInstanceId` envelope) to the SAME
 * extension-aware resolution as `SectionRenderer`'s extension branch:
 *
 * - Per-mode resolution parity: the studio twin resolves the same
 *   `resolvePresentation` mode/outcome as the canonical extension node for
 *   `native-builtin`, `official`, `plugin-isolated`, `plugin-themeable`,
 *   `theme-owned` (owner-definition + recoverable) and missing keys.
 * - Per-instance props (validated, never globals) ride the
 *   isolated/themeable/native lanes; two instances differ.
 * - Hostile props are neutralized at the boundary.
 * - Missing/incompatible render labelled placeholders in editing, null
 *   otherwise — fail-closed, never another owner's component.
 * - Uploaded-theme widgets render via the sandboxed `ThemeWidgetPreview`
 *   ONLY when a binding arrives through the canvas tree; absent binding
 *   keeps the explicit placeholder.
 * - Legacy studio nodes (no extension envelope) render byte-identical with
 *   or without the new canvas props.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioCanvas } from "@/components/builder/studio/StudioCanvas";
import {
  resolveStudioExtension,
  StudioWidget,
} from "@/components/builder/studio/renderers";
import type { DevThemeBinding } from "@/components/builder/SectionRenderer";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
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
  clearThemePresentations,
  registerGenericPresentation,
  registerThemeOwnedComponent,
} from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { fromDevThemeManifest } from "@/lib/dev-theme-widgets";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";
import { emptyStudioDoc, type StudioNode } from "@/lib/studio/model";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import type { Section } from "@/lib/builder-ast";

/* --------------------------------------------------------------- fixtures */

const REVIEW_KEY = "plugin:acme/reviews";
const STARS_KEY = "plugin:acme/stars";
const OFFICIAL_KEY = "plugin:product-reviews/summary";

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

function acmeInstalls(over: Partial<InstalledPlugin> = {}): InstalledPlugin[] {
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
            entry: 'framique.mount("ACME-REVIEWS-STUDIO")',
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
          },
          {
            key: "stars",
            label: "Stars",
            slots: ["main"],
            entry: 'framique.mount("ACME-STARS-STUDIO")',
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
      ...over,
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
            entry: 'framique.mount("OFFICIAL-SUMMARY-STUDIO")',
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

/** Canonical extension node (old-path shape) for parity comparisons. */
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

/** Studio twin built through the REAL bridge (insert → twin). */
function twin(
  widgetKey: string,
  props: Record<string, unknown> = {},
  registry?: UnifiedRegistry,
): StudioNode {
  const reg =
    registry ??
    registryWith([pluginDef(REVIEW_KEY, true), pluginDef(STARS_KEY, true)]);
  const built = buildExtensionInsert(reg, {
    widgetKey,
    slot: "main",
    generateId: () => `twin-${widgetKey.replace(/[^a-z]/gi, "")}`,
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
  const node = studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...props },
  });
  return node;
}

function renderStudio(
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

function renderOld(
  section: Section,
  plugins: InstalledPlugin[],
  opts: { registry?: UnifiedRegistry; themeKey?: string | null } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <SectionRenderer
        section={section}
        locale="en"
        editing
        themeKey={opts.themeKey ?? null}
        registry={opts.registry}
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

function themeManifest(over: Record<string, unknown> = {}) {
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
    ...over,
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

const THEME_WIDGET = "theme:aurora-lookbook/hero";

afterEach(() => {
  clearCommunityPresentations();
});

/* --------------------------------------- resolution parity per mode ----- */

describe("studio extension twins — resolution parity with SectionRenderer", () => {
  const plugins = () => acmeInstalls();
  const reg = () =>
    registryWith([pluginDef(REVIEW_KEY, true), pluginDef(STARS_KEY, true)]);

  it("native-builtin twins resolve native-builtin like the canonical node", () => {
    const node = twin("builtin:heading", { text: "Hi" });
    const studio = resolveStudioExtension(node, null, undefined, plugins());
    expect(studio?.ok).toBe(true);
    if (!studio?.ok || studio.mode !== "native-builtin") {
      expect.unreachable("expected studio native-builtin");
      return;
    }
    expect(studio.props).toEqual({ text: "Hi" });
  });

  it("isolated twins resolve plugin-isolated with validated props", () => {
    const node = twin(REVIEW_KEY, {
      title: "Hello",
      unknownKey: "drop-me",
    });
    const out = resolveStudioExtension(node, null, reg(), plugins());
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "plugin-isolated") {
      expect.unreachable("expected plugin-isolated");
      return;
    }
    expect(out.props.title).toBe("Hello");
    expect(out.props).not.toHaveProperty("unknownKey");
  });

  it("themeable twins resolve plugin-themeable when installs declare it", () => {
    const node = twin(STARS_KEY, { title: "Great" });
    const out = resolveStudioExtension(node, "proof-alpha", reg(), plugins());
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "plugin-themeable") {
      expect.unreachable("expected plugin-themeable");
      return;
    }
    expect(out.props.title).toBe("Great");
    expect(out.data).toEqual({ greeting: "Hello!", count: 3 });
  });

  it("official twins resolve official like the canonical node", () => {
    const node = twin(
      OFFICIAL_KEY,
      {},
      registryWith([pluginDef(OFFICIAL_KEY)]),
    );
    // The def must ride a threaded registry: with no injected registry the
    // reference builds its builtin + studio + singleton fallback (no plugin
    // defs), so the canonical node misses there too — verified by the
    // differential pin in `studio-extension-twin-parity.test.tsx`.
    const out = resolveStudioExtension(
      node,
      null,
      registryWith([pluginDef(OFFICIAL_KEY)]),
      officialInstall(),
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "official") {
      expect.unreachable("expected official");
      return;
    }
  });

  it("theme-owned twins resolve owner-definition under the owning theme", () => {
    const node = twin(THEME_WIDGET, { kicker: "Hi" }, themeRegistry());
    const out = resolveStudioExtension(
      node,
      "aurora-lookbook",
      themeRegistry(),
      [],
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "theme-owned") {
      expect.unreachable("expected theme-owned");
      return;
    }
    expect(out.presentation).toBe("owner-definition");
  });

  it("foreign theme-owned twins fall back recoverably, never cross-owner", () => {
    const node = twin(THEME_WIDGET, { kicker: "Hi" }, themeRegistry());
    const out = resolveStudioExtension(
      node,
      "songoskriti",
      themeRegistry(),
      [],
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "theme-owned") {
      expect.unreachable("expected theme-owned");
      return;
    }
    expect(out.presentation).toBe("recoverable-fallback");
  });

  it("unknown keys miss exactly like the canonical node", () => {
    const node = twin("plugin:ghost/missing", {}, registryWith([]));
    const out = resolveStudioExtension(node, null, registryWith([]), []);
    expect(out?.ok).toBe(false);
  });

  it("legacy (non-envelope) nodes bypass extension resolution", () => {
    const legacy = appBlockNodeForPlugin(REVIEW_KEY);
    expect(resolveStudioExtension(legacy, null, reg(), plugins())).toBeNull();
  });
});

/* --------------------------------------------- render parity lanes ----- */

describe("studio extension twins — render parity per lane", () => {
  it("isolated lane renders the same sandboxed island as SectionRenderer", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const node = twin(REVIEW_KEY, { title: "Hello ext" }, reg);
    const studio = renderStudio(node, acmeInstalls(), {
      registry: reg,
      editing: true,
    });
    const old = renderOld(
      extSection(REVIEW_KEY, { title: "Hello ext" }),
      acmeInstalls(),
      { registry: reg },
    );
    expect(studio).toContain("<iframe");
    expect(studio).toContain("Hello ext");
    // Island parity, not wrapper parity: the reference wraps the island in
    // its own `fq-node` chrome keyed by the CANONICAL section id
    // (`data-fq-node="ext-1"`), which the twin never sees — twin ids are
    // bridge-generated — and the live canvas wraps twins in its own
    // `.fq-studio-node` chrome instead. The island itself (the sandboxed
    // frame carrying the bundle bytes + instance props) is byte-identical:
    expect(old).toContain(studio);
    // Sandbox island contract: scripts run, same-origin never does. (The
    // literal phrase occurs in a frame-document comment describing the
    // absence, so tokens are checked on the sandbox attribute itself.)
    expect(studio).toContain("sandbox=");
    const sandboxAttr = studio.match(/sandbox="([^"]*)"/)?.[1] ?? "";
    const sandboxTokens = sandboxAttr.split(/\s+/).filter(Boolean);
    expect(sandboxTokens).toContain("allow-scripts");
    expect(sandboxTokens).not.toContain("allow-same-origin");
    // Bundle bytes ride ONLY inside the frame document:
    expect(studio).toContain("ACME-REVIEWS-STUDIO");
  });

  it("themeable dressed lane renders the same presentation as SectionRenderer", () => {
    function Capture(
      props: CommunityPresentationProps & {
        instanceProps?: Record<string, unknown>;
      },
    ) {
      return (
        <p data-stars-studio="yes">{String(props.instanceProps?.title)}</p>
      );
    }
    registerCommunityPresentation("proof-alpha", STARS_KEY, Capture);
    const reg = registryWith([pluginDef(STARS_KEY, true)]);
    const node = twin(STARS_KEY, { title: "Great" }, reg);
    const studio = renderStudio(node, acmeInstalls(), {
      registry: reg,
      themeKey: "proof-alpha",
      editing: true,
    });
    expect(studio).toContain("data-stars-studio");
    expect(studio).toContain("Great");
    expect(studio).not.toContain("<iframe");
  });

  it("native-builtin twins render studio-native content, never a placeholder", () => {
    const node = twin("builtin:heading", { text: "Hello ext" });
    const html = renderStudio(node, [], { editing: true });
    expect(html).toContain("Hello ext");
    expect(html).not.toContain("Widget preview unavailable");
  });

  it("foreign themed twins render the universal generic body, the dress under its own", () => {
    const ID = "theme:synthetic/ornate";
    const reg = registryWith([
      {
        id: ID,
        namespace: "theme",
        version: "1.0.0",
        label: "Ornate",
        category: "content",
        slots: ["main"],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "custom",
        themes: ["synthetic"],
      },
    ]);
    const Dress: WidgetComponent = (ctx) => (
      <p data-synthetic-dress="yes">{ctx.str("kicker")}</p>
    );
    const Body: WidgetComponent = (ctx) => (
      <p data-synthetic-body="yes">{ctx.str("kicker")}</p>
    );
    registerThemeOwnedComponent(ID, Dress);
    registerGenericPresentation(ID, Body);
    try {
      // Theme = dress, widget = body: the twin renders the widget's own
      // neutral body under a foreign active theme — never the old
      // placeholder, never a cross-owner component.
      const node = twin(ID, { kicker: "Kept" }, reg);
      const foreign = renderStudio(node, [], {
        registry: reg,
        themeKey: "acme-pack",
        editing: true,
      });
      expect(foreign).toContain('data-synthetic-body="yes"');
      expect(foreign).toContain("Kept");
      expect(foreign).not.toContain('data-synthetic-dress="yes"');
      expect(foreign).not.toContain("Widget preview unavailable");
      // The owner's dress still wins under the owning theme.
      const owner = renderStudio(node, [], {
        registry: reg,
        themeKey: "synthetic",
        editing: true,
      });
      expect(owner).toContain('data-synthetic-dress="yes"');
      expect(owner).toContain("Kept");
      expect(owner).not.toContain('data-synthetic-body="yes"');
    } finally {
      clearThemePresentations();
    }
  });

  it("official lane renders the sandboxed frame for installed officials", () => {
    const reg = registryWith([pluginDef(OFFICIAL_KEY)]);
    const node = twin(OFFICIAL_KEY, {}, reg);
    const html = renderStudio(node, officialInstall(), {
      registry: reg,
      editing: true,
    });
    expect(html).toContain("Reviews Test");
    expect(html).toContain("<iframe");
    expect(html).not.toContain("Widget preview unavailable");
  });
});

/* --------------------------------------- instance-props separation ----- */

describe("studio extension twins — per-instance props stay separate", () => {
  it("two instances of one widget render their own props only", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const plugins = acmeInstalls();
    const htmlA = renderStudio(
      twin(REVIEW_KEY, { title: "Alpha" }, reg),
      plugins,
      {
        registry: reg,
        editing: true,
      },
    );
    const htmlB = renderStudio(
      twin(REVIEW_KEY, { title: "Beta" }, reg),
      plugins,
      {
        registry: reg,
        editing: true,
      },
    );
    expect(htmlA).toContain("Alpha");
    expect(htmlA).not.toContain("Beta");
    expect(htmlB).toContain("Beta");
    expect(htmlB).not.toContain("Alpha");
  });

  it("global install settings never merge into instance props", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const html = renderStudio(
      twin(REVIEW_KEY, { title: "Hello ext" }, reg),
      acmeInstalls(),
      {
        registry: reg,
        editing: true,
      },
    );
    expect(html).toContain("Hello ext");
    // Globals stay behind the scoped bridge — never baked into the frame.
    expect(html).not.toContain("Hello!");
  });
});

/* ------------------------------------------------------- hostile ------- */

describe("studio extension twins — hostile props are neutralized", () => {
  it("strips script markup and unknown keys from the island", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const html = renderStudio(
      twin(
        REVIEW_KEY,
        {
          title: "<script>alert(1)</script>Hi",
          unknownKey: "drop-me",
        },
        reg,
      ),
      acmeInstalls(),
      { registry: reg, editing: true },
    );
    expect(html).toContain("Hi");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("unknownKey");
  });

  it("drops proto-pollution keys without polluting", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"},"title":"ok"}');
    const html = renderStudio(twin(REVIEW_KEY, hostile, reg), acmeInstalls(), {
      registry: reg,
      editing: true,
    });
    expect(html).toContain("ok");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

/* --------------------------------------- missing / incompatible -------- */

describe("studio extension twins — missing/incompatible stay fail-closed", () => {
  it("unknown widgets render the labelled placeholder in editing, null otherwise", () => {
    const reg = registryWith([]);
    const node = twin("plugin:ghost/missing", {}, reg);
    const editing = renderStudio(node, [], { registry: reg, editing: true });
    expect(editing).toContain("Widget preview unavailable");
    expect(editing).not.toContain("<iframe");
    const plain = renderStudio(node, [], { registry: reg });
    expect(plain).toBe("");
  });

  it("disabled installs keep the labelled placeholder, never the island", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const disabled = acmeInstalls({ enabled: false });
    const html = renderStudio(
      twin(REVIEW_KEY, { title: "Hi" }, reg),
      disabled,
      {
        registry: reg,
        editing: true,
      },
    );
    expect(html).toContain("switched off");
    expect(html).not.toContain("<iframe");
  });

  it("uninstalled widgets keep the labelled placeholder, never the island", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const html = renderStudio(twin(REVIEW_KEY, { title: "Hi" }, reg), [], {
      registry: reg,
      editing: true,
    });
    expect(html).toContain("not installed");
    expect(html).not.toContain("<iframe");
  });

  it("foreign theme-owned twins keep the explicit placeholder", () => {
    const reg = themeRegistry();
    const node = twin(THEME_WIDGET, { kicker: "Hi" }, reg);
    const html = renderStudio(node, [], {
      registry: reg,
      themeKey: "songoskriti",
      editing: true,
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });
});

/* --------------------------------------- uploaded-theme binding -------- */

describe("studio extension twins — uploaded-theme binding through the tree", () => {
  function themeTwin(props: Record<string, unknown> = {}) {
    return twin(THEME_WIDGET, props, themeRegistry());
  }

  it("bound + approved renders the sandboxed frame, never the placeholder", () => {
    const html = renderStudio(themeTwin({ kicker: "New drop" }), [], {
      registry: themeRegistry(),
      themeKey: "aurora-lookbook",
      binding: themeBinding(),
      editing: true,
    });
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).toContain("<iframe");
    expect(html).toContain("/t/aurora-lookbook/1.0.0/");
    expect(html).not.toContain("HeroCanvas(");
  });

  it("absent binding keeps the explicit placeholder", () => {
    const html = renderStudio(themeTwin({ kicker: "Hi" }), [], {
      registry: themeRegistry(),
      themeKey: "aurora-lookbook",
      editing: true,
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });

  it("version-skewed binding keeps the placeholder", () => {
    const html = renderStudio(themeTwin({ kicker: "Hi" }), [], {
      registry: themeRegistry(),
      themeKey: "aurora-lookbook",
      binding: themeBinding({
        theme: { name: "aurora-lookbook", version: "2.0.0" },
      }),
      editing: true,
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });

  it("hostile props are neutralized before the theme sandbox", () => {
    const html = renderStudio(
      themeTwin({
        kicker: "<script>alert(1)</script>Drop",
        unknownKey: "dropped",
      }),
      [],
      {
        registry: themeRegistry(),
        themeKey: "aurora-lookbook",
        binding: themeBinding(),
        editing: true,
      },
    );
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("unknownKey");
  });
});

/* ------------------------------------------------------- legacy -------- */

describe("studio legacy nodes — byte-identical with or without tree props", () => {
  const noop = () => {};

  function canvasHtml(
    nodes: StudioNode[],
    extra: {
      registry?: UnifiedRegistry;
      themeKey?: string | null;
      binding?: DevThemeBinding;
    } = {},
  ): string {
    const doc = { ...emptyStudioDoc(), root: nodes };
    return renderToStaticMarkup(
      <PluginProvider plugins={acmeInstalls()}>
        <StudioCanvas
          doc={doc}
          device="desktop"
          selectedId={null}
          onSelect={noop}
          onDrop={noop}
          onDragNode={noop}
          onDuplicate={noop}
          onDelete={noop}
          onAddInside={noop}
          onAddRoot={noop}
          onContextMenu={noop}
          onInlineEdit={noop}
          registry={extra.registry}
          themeKey={extra.themeKey}
          devThemeBinding={extra.binding}
        />
      </PluginProvider>,
    );
  }

  it("legacy text widgets render byte-identically with tree props present", () => {
    const node: StudioNode = {
      id: "t-1",
      el: "text",
      settings: { text: "Hi" },
    };
    const bare = renderStudio(node, acmeInstalls(), { editing: true });
    const wired = renderStudio(node, acmeInstalls(), {
      editing: true,
      registry: registryWith([pluginDef(REVIEW_KEY, true)]),
      themeKey: "proof-alpha",
      binding: themeBinding(),
    });
    expect(bare).toBe('<p class="leading-relaxed">Hi</p>');
    expect(wired).toBe(bare);
  });

  it("legacy app-block nodes keep their labelled placeholders", () => {
    const empty = appBlockNodeForPlugin("");
    const html = renderStudio(empty, acmeInstalls(), { editing: true });
    expect(html).toContain("No app widget selected");
    const wired = renderStudio(empty, acmeInstalls(), {
      editing: true,
      registry: registryWith([pluginDef(REVIEW_KEY, true)]),
      themeKey: "proof-alpha",
      binding: themeBinding(),
    });
    expect(wired).toBe(html);
  });

  it("legacy app-block islands ignore tree props byte-identically", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const legacy = appBlockNodeForPlugin(REVIEW_KEY);
    const bare = renderStudio(legacy, acmeInstalls(), { editing: true });
    const wired = renderStudio(legacy, acmeInstalls(), {
      editing: true,
      registry: reg,
      themeKey: "proof-alpha",
      binding: themeBinding(),
    });
    expect(bare).toContain("<iframe");
    expect(wired).toBe(bare);
  });

  it("the canvas threads the binding to theme twins (absent → placeholder)", () => {
    const reg = themeRegistry();
    const node = twin(THEME_WIDGET, { kicker: "Hi" }, reg);
    const bound = canvasHtml([node], {
      registry: reg,
      themeKey: "aurora-lookbook",
      binding: themeBinding(),
    });
    expect(bound).toContain("<iframe");
    expect(bound).not.toContain("Widget preview unavailable");
    const unbound = canvasHtml([node], {
      registry: reg,
      themeKey: "aurora-lookbook",
    });
    expect(unbound).toContain("Widget preview unavailable");
  });

  it("the canvas renders plugin twins through the same island as SectionRenderer", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY, true)]);
    const node = twin(REVIEW_KEY, { title: "Canvas twin" }, reg);
    const html = canvasHtml([node], { registry: reg });
    expect(html).toContain("<iframe");
    expect(html).toContain("Canvas twin");
  });
});
