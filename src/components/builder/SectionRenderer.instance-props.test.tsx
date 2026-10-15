/**
 * Frame30 — per-instance plugin props threading (TDD).
 *
 * Canonical extension nodes carry per-instance `props`; the plugin lanes
 * dropped them (PluginBlock got no instance props at all). This suite pins:
 *
 * Pass 1 — validated threading: extension-node props flow through
 *   resolveExtensionForRender/resolvePresentation → PluginBlock →
 *   WidgetSandbox (isolated runtime) AND the Class B dressed presentation,
 *   validated against the widget schema at every boundary. Global install
 *   settings ride distinctly and are never merged into instance props.
 * Pass 2 — instance isolation: two instances of one widget render
 *   independently; editing one never leaks into the other or globals.
 * Pass 3 — adversarial: hostile props are neutralized at the boundary.
 * Pass 4 — no regressions: legacy `plugin_block`, native-builtin and
 *   theme-owned paths stay byte-identical; nested extensions validate too.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "@/lib/builder-ast";
import { SectionRenderer, resolveExtensionForRender } from "./SectionRenderer";
import { PluginBlock } from "./PluginBlock";
import { PluginProvider } from "./PluginContext";
import {
  answerWidgetCall,
  FRAME_HTML,
  validateInstanceProps,
  WidgetSandbox,
} from "@/components/marketplace/WidgetSandbox";
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
import { defaultsFor } from "@/lib/widget-props";
import { resolvePresentation } from "@/lib/widget-presentation";
import type { InstalledPlugin } from "@/lib/plugin-manifest";

/* --------------------------------------------------------------- fixtures */

const FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Untitled", max: 20 },
  { key: "limit", label: "Limit", kind: "number", min: 1, max: 24, default: 5 },
  {
    key: "mode",
    label: "Mode",
    kind: "select",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
    default: "a",
  },
  { key: "show", label: "Show", kind: "boolean", default: false },
] as unknown as WidgetDef["propsSchema"]["fields"];

const REVIEW_KEY = "plugin:acme/reviews";
const STARS_KEY = "plugin:acme/stars";
const LEGACY_KEY = "plugin:acme/legacy";
const THEME = "proof-alpha";

function registryWithSchemas(): UnifiedRegistry {
  const reg = createWidgetRegistry();
  const defs: WidgetDef[] = [
    {
      id: REVIEW_KEY,
      namespace: "plugin",
      version: "1.0.0",
      label: "Reviews",
      category: "plugin",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [...FIELDS] },
      renderer: "sandbox",
    },
    {
      id: STARS_KEY,
      namespace: "plugin",
      version: "1.0.0",
      label: "Stars",
      category: "plugin",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [...FIELDS] },
      renderer: "sandbox",
    },
    {
      id: LEGACY_KEY,
      namespace: "plugin",
      version: "1.0.0",
      label: "Legacy",
      category: "plugin",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "sandbox",
    },
  ];
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function schemaFieldArray(): InstalledPlugin["manifest"]["widgets"][number]["propsSchema"] {
  return JSON.parse(JSON.stringify(FIELDS));
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
            entry: 'framique.mount("ACME-REVIEWS-IPROP")',
            height: 200,
            propsSchema: schemaFieldArray(),
          },
          {
            key: "stars",
            label: "Stars",
            slots: ["main"],
            entry: 'framique.mount("ACME-STARS-IPROP")',
            height: 200,
            propsSchema: schemaFieldArray(),
            themeable: { version: 1 as const, schema: "schema:ref" },
          },
          {
            key: "legacy",
            label: "Legacy",
            slots: ["main"],
            entry: 'framique.mount("ACME-LEGACY-IPROP")',
            height: 200,
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

function extNode(widgetKey: string, props: Record<string, unknown> = {}) {
  return {
    id: `ext-${widgetKey}`,
    type: "extension",
    instanceId: `ext-${widgetKey}`,
    owner: { kind: "plugin", id: widgetKey },
    widgetKey,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

function renderExt(
  node: Section,
  plugins: InstalledPlugin[],
  opts: { registry?: UnifiedRegistry; themeKey?: string | null } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <SectionRenderer
        section={node}
        locale="en"
        editing
        themeKey={opts.themeKey ?? null}
        registry={opts.registry}
      />
    </PluginProvider>,
  );
}

afterEach(() => {
  clearCommunityPresentations();
});

/* ------------------------------------------------- Pass 1: threading --- */

describe("Pass 1 — validated per-instance props reach the isolated runtime", () => {
  it("resolveExtensionForRender validates isolated props against the schema", () => {
    const out = resolveExtensionForRender(
      extNode(REVIEW_KEY, {
        title: "<script>alert(1)</script>Hi",
        limit: 99,
        mode: "zzz",
        show: "yes",
        unknownKey: "drop-me",
      }),
      null,
      registryWithSchemas(),
      { installedPlugins: installs() },
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "plugin-isolated") {
      expect.unreachable("expected plugin-isolated");
      return;
    }
    expect(out.props).toEqual({
      title: "Hi",
      limit: 24,
      mode: "a",
      show: false,
    });
  });

  it("resolvePresentation validates Class B props and keeps data separate", () => {
    const out = resolvePresentation({
      widgetId: {
        ...extNode(STARS_KEY),
        props: { title: "Great", bogus: 1 },
      } as never,
      themeKey: THEME,
      registry: registryWithSchemas(),
      props: { title: "Great", bogus: 1 },
      installedPlugins: installs(),
    });
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "plugin-themeable") {
      expect.unreachable("expected plugin-themeable");
      return;
    }
    expect(out.props.title).toBe("Great");
    expect(out.props).not.toHaveProperty("bogus");
    expect(out.props).not.toHaveProperty("greeting");
    expect(out.data).toEqual({ greeting: "Hello!", count: 3 });
    expect(out.data).not.toHaveProperty("title");
  });

  it("the isolated island carries instance props in the frame, settings stay global", async () => {
    const html = renderExt(
      extNode(REVIEW_KEY, { title: "Hello ext" }),
      installs(),
      {
        registry: registryWithSchemas(),
      },
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("framique.props");
    expect(html).toContain("Hello ext");
    expect(html).not.toContain("unknownKey");
    // Global settings are NOT baked into the frame: they stay behind the
    // scoped `plugin.settings` bridge method.
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
    expect(ans).not.toEqual(expect.objectContaining({ title: "Hello ext" }));
  });

  it("the dressed Class B presentation gets instance props distinct from data", () => {
    let seen: unknown = null;
    function Capture(
      props: CommunityPresentationProps & {
        instanceProps?: Record<string, unknown>;
      },
    ) {
      seen = props;
      return <p data-stars-iprop="yes">{String(props.instanceProps?.title)}</p>;
    }
    registerCommunityPresentation(THEME, STARS_KEY, Capture);
    const html = renderExt(extNode(STARS_KEY, { title: "Great" }), installs(), {
      registry: registryWithSchemas(),
      themeKey: THEME,
    });
    expect(html).toContain("data-stars-iprop");
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

  it("the undressed Class B island carries validated props, never the bundle merge", () => {
    const html = renderExt(
      extNode(STARS_KEY, { title: "Plain", bogus: "x" }),
      installs(),
      { registry: registryWithSchemas(), themeKey: "proof-plain" },
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("Plain");
    expect(html).not.toContain("bogus");
  });

  it("validation is idempotent across boundaries", () => {
    const once = validateInstanceProps(
      { title: "Hi", limit: 99, bogus: 1 },
      { fields: [...FIELDS] },
    );
    const twice = validateInstanceProps(once, { fields: [...FIELDS] });
    expect(twice).toEqual(once);
  });
});

/* ------------------------------------------------- Pass 2: isolation --- */

describe("Pass 2 — one instance never leaks into another or globals", () => {
  it("two instances of one widget render their own props only", () => {
    const plugins = installs();
    const registry = registryWithSchemas();
    const htmlA = renderExt(extNode(REVIEW_KEY, { title: "Alpha" }), plugins, {
      registry,
    });
    const htmlB = renderExt(extNode(REVIEW_KEY, { title: "Beta" }), plugins, {
      registry,
    });
    expect(htmlA).toContain("Alpha");
    expect(htmlA).not.toContain("Beta");
    expect(htmlB).toContain("Beta");
    expect(htmlB).not.toContain("Alpha");
  });

  it("mutating one resolution never touches the sibling or the stored node", () => {
    const registry = registryWithSchemas();
    const plugins = installs();
    const nodeA = extNode(REVIEW_KEY, { title: "Alpha" });
    const outA = resolveExtensionForRender(nodeA, null, registry, {
      installedPlugins: plugins,
    });
    const outB = resolveExtensionForRender(
      extNode(REVIEW_KEY, { title: "Beta" }),
      null,
      registry,
      { installedPlugins: plugins },
    );
    expect(outA?.ok && outB?.ok).toBe(true);
    if (!outA?.ok || !outB?.ok) return;
    (outA.props as Record<string, unknown>).title = "HACK";
    expect(outB.props.title).toBe("Beta");
    expect(
      (nodeA as unknown as { props: Record<string, unknown> }).props.title,
    ).toBe("Alpha");
    expect(outA.props).not.toBe(outB.props);
  });

  it("renders never mutate the install's global settings", () => {
    const plugins = installs();
    const before = JSON.parse(JSON.stringify(plugins[0]!.settings));
    renderExt(extNode(REVIEW_KEY, { title: "Alpha" }), plugins, {
      registry: registryWithSchemas(),
    });
    renderExt(extNode(STARS_KEY, { title: "Beta" }), plugins, {
      registry: registryWithSchemas(),
      themeKey: THEME,
    });
    expect(plugins[0]!.settings).toEqual(before);
  });
});

/* ------------------------------------------------- Pass 3: hostile ---- */

describe("Pass 3 — hostile instance props are neutralized", () => {
  const registry = () => registryWithSchemas();
  const plugins = () => installs();

  function isolatedProps(props: Record<string, unknown>) {
    const out = resolveExtensionForRender(
      extNode(REVIEW_KEY, props),
      null,
      registry(),
      {
        installedPlugins: plugins(),
      },
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "plugin-isolated") {
      throw new Error("expected plugin-isolated");
    }
    return out.props;
  }

  it("strips script strings to inert text", () => {
    expect(isolatedProps({ title: "<script>alert(1)</script>Hi" }).title).toBe(
      "Hi",
    );
    expect(
      isolatedProps({ title: "<img src=x onerror=alert(1)>Hi" }).title,
    ).not.toContain("onerror");
  });

  it("drops __proto__/constructor/prototype keys without polluting", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"x":1},"prototype":{},"title":"ok"}',
    );
    const clean = isolatedProps(hostile);
    expect(clean).not.toHaveProperty("__proto__");
    expect(clean).not.toHaveProperty("constructor");
    expect(clean).not.toHaveProperty("prototype");
    expect(clean.title).toBe("ok");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      (Object.prototype as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });

  it("truncates oversize text to the schema limit", () => {
    const clean = isolatedProps({ title: "x".repeat(20_000) });
    expect(typeof clean.title === "string" && clean.title.length).toBe(20);
  });

  it("caps deep nesting on legacy (empty-schema) defs", () => {
    const out = resolveExtensionForRender(
      extNode(LEGACY_KEY, { a: { b: { c: { d: { e: "deep" } } } } }),
      null,
      registry(),
      { installedPlugins: plugins() },
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok) return;
    expect(JSON.stringify(out.props)).not.toContain("deep");
  });

  it("drops non-JSON values (functions, symbols, undefined)", () => {
    const clean = validateInstanceProps(
      { title: "ok", fn: () => {}, sym: Symbol("s"), u: undefined },
      { fields: [] },
    );
    expect(clean).toEqual({ title: "ok" });
  });

  it("fails closed on circular / bigint payloads", () => {
    const circular: Record<string, unknown> = { title: "x" };
    circular.self = circular;
    expect(validateInstanceProps(circular, { fields: [] })).toEqual({});
    expect(validateInstanceProps({ big: 10n }, { fields: [] })).toEqual({});
    const schemaDefaults = defaultsFor({ fields: [...FIELDS] });
    expect(validateInstanceProps(circular, { fields: [...FIELDS] })).toEqual(
      schemaDefaults,
    );
  });

  it("strips unknown keys for schema defs", () => {
    const clean = isolatedProps({
      title: "ok",
      evil: "drop",
      nested: { x: 1 },
    });
    expect(clean).not.toHaveProperty("evil");
    expect(clean).not.toHaveProperty("nested");
  });

  it("never mutates its input, even when frozen", () => {
    const input = Object.freeze({
      title: "ok",
      limit: 99,
      extra: Object.freeze({ x: 1 }),
    });
    const snapshot = JSON.stringify(input);
    const clean = validateInstanceProps(input, { fields: [...FIELDS] });
    expect(clean.limit).toBe(24);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("the frame document drops hostile keys and escapes markup", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"title":"x</script><script>alert(1)"}',
    );
    const html = FRAME_HTML(
      "framique.mount(1)",
      "https://shop.example.com",
      "n",
      hostile,
    );
    expect(html).not.toContain("__proto__");
    expect((html.match(/<script/g) ?? []).length).toBe(1);
    expect(html).toContain("framique.props");
  });

  it("PluginBlock re-validates hostile props at its own boundary", () => {
    const html = renderToStaticMarkup(
      <PluginProvider plugins={installs()}>
        <PluginBlock
          pluginKey={REVIEW_KEY}
          height={200}
          editing
          instanceProps={{
            title: "<script>alert(1)</script>Hi",
            unknownKey: "drop",
          }}
        />
      </PluginProvider>,
    );
    expect(html).toContain("<iframe");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("unknownKey");
  });
});

/* --------------------------------------- Pass 4: no regressions ------ */

describe("Pass 4 — legacy and non-plugin paths stay byte-identical", () => {
  it("legacy PluginBlock (no instanceProps) emits no props channel", () => {
    const html = renderToStaticMarkup(
      <PluginProvider plugins={installs()}>
        <PluginBlock pluginKey={REVIEW_KEY} height={200} editing />
      </PluginProvider>,
    );
    expect(html).toContain("<iframe");
    expect(html).not.toContain("framique.props");
  });

  it("WidgetSandbox without instanceProps renders the exact legacy frame", () => {
    const without = FRAME_HTML("framique.mount(1)", "https://o.example", "n");
    const withUndefined = FRAME_HTML(
      "framique.mount(1)",
      "https://o.example",
      "n",
      undefined,
    );
    expect(withUndefined).toBe(without);
    expect(without).not.toContain("framique.props");
    const shell = renderToStaticMarkup(
      <WidgetSandbox
        title="T"
        entry="framique.mount(1)"
        grantedScopes={["render_storefront"]}
        onCall={async () => ({ ok: true })}
      />,
    );
    expect(shell).not.toContain("framique.props");
  });

  it("legacy plugin_block section markup carries no props channel", () => {
    const section = {
      id: "legacy-1",
      type: "plugin_block",
      props: { pluginKey: REVIEW_KEY, height: 200 },
    } as unknown as Section;
    const html = renderToStaticMarkup(
      <PluginProvider plugins={installs()}>
        <SectionRenderer section={section} locale="en" editing />
      </PluginProvider>,
    );
    expect(html).toContain("<iframe");
    expect(html).not.toContain("framique.props");
  });

  it("native-builtin extension props pass through untouched (not schema-stripped)", () => {
    const out = resolveExtensionForRender(
      extNode("builtin:heading", { text: "Hi <b>x</b>", unknown: 1 }),
      null,
      undefined,
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "native-builtin") {
      expect.unreachable("expected native-builtin");
      return;
    }
    expect(out.props).toEqual({ text: "Hi <b>x</b>", unknown: 1 });
  });

  it("official lane validates props without changing attribution", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({
        id: "plugin:product-reviews/summary",
        namespace: "plugin",
        version: "1.0.0",
        label: "Summary",
        category: "plugin",
        slots: ["main"],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "sandbox",
      }),
    ).toEqual(expect.objectContaining({ ok: true }));
    const out = resolveExtensionForRender(
      extNode("plugin:product-reviews/summary", {
        title: "ok",
        __proto__: { polluted: "yes" },
      } as Record<string, unknown>),
      null,
      reg,
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "official") {
      expect.unreachable("expected official");
      return;
    }
    expect(out.props).not.toHaveProperty("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("nested extensions under a container validate too", () => {
    const child = extNode(REVIEW_KEY, {
      title: "<script>alert(1)</script>Nest",
      unknownKey: "drop",
    });
    const parent = {
      id: "parent-1",
      type: "container",
      props: {},
      children: [child],
    } as unknown as Section;
    const html = renderToStaticMarkup(
      <PluginProvider plugins={installs()}>
        <SectionRenderer
          section={parent}
          locale="en"
          editing
          registry={registryWithSchemas()}
        />
      </PluginProvider>,
    );
    expect(html).toContain("Nest");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("unknownKey");
  });
});
