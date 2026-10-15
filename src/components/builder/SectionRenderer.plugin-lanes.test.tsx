/**
 * Frame30 task (B) — SectionRenderer per-mode plugin/theme lanes (TDD).
 *
 * - `official` → trusted source-backed lane: a real official plugin id with
 *   an in-repo source renders the sandboxed plugin frame; uninstalled
 *   official widgets stay on the existing placeholder.
 * - `plugin-isolated` (Class A) → the null-origin sandboxed island even when
 *   a community presentation is registered and a theme key is set (Class A
 *   is never dressed).
 * - `plugin-themeable` (Class B) → the registered Class B theme presentation
 *   when dressed (the bundle never executes: no iframe, no entry bytes in
 *   the markup), else the same sandboxed island.
 * - `theme-owned` owner-definition → the existing placeholder: no approved
 *   theme-owned component source exists in-repo (theme presentations are
 *   keyed by SectionType, never by `theme:<owner>/...` ids), so even the
 *   owning-theme hit is genuinely missing a renderer — fail-closed, never
 *   another owner's component.
 * - Every plugin lane: untrusted bundle bytes never reach the page DOM (no
 *   entry marker in the markup; the island carries a script-only sandbox
 *   with no same-origin token).
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "@/lib/builder-ast";
import { SectionRenderer, resolveExtensionForRender } from "./SectionRenderer";
import { PluginProvider } from "./PluginContext";
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
import type { InstalledPlugin } from "@/lib/plugin-manifest";

/* --------------------------------------------------------------- fixtures */

function pluginDef(
  id: string,
  opts: { label?: string; slots?: string[] } = {},
): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: opts.label ?? `Label ${id}`,
    category: "plugin",
    slots: opts.slots ?? ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "sandbox",
  };
}

function themeDef(id: string, themes: string[]): WidgetDef {
  return {
    id,
    namespace: "theme",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "content",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "custom",
    themes,
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) {
    const verdict = reg.registerWidget(def);
    expect(verdict.ok).toBe(true);
  }
  return reg;
}

function installedPlugin(opts: {
  id: string;
  name: string;
  widgets: {
    key: string;
    label: string;
    entry?: string;
    themeable?: boolean;
    height?: number;
  }[];
  settings?: Record<string, string | number | boolean>;
  enabled?: boolean;
}): InstalledPlugin {
  return {
    installId: `install-${opts.id}`,
    manifest: {
      id: opts.id,
      name: opts.name,
      version: "1.2.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: opts.widgets.map((w) => ({
        key: w.key,
        label: w.label,
        slots: ["main"],
        entry: w.entry ?? `framique.mount("${opts.id}-${w.key}-EZENTRY-9f8")`,
        height: w.height ?? 200,
        ...(w.themeable
          ? { themeable: { version: 1 as const, schema: "schema:ref" } }
          : {}),
      })),
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: (opts.settings ?? {}) as InstalledPlugin["settings"],
    enabled: opts.enabled ?? true,
  };
}

function extNode(widgetKey: string, props: Record<string, unknown> = {}) {
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

function renderExt(
  node: Section,
  plugins: InstalledPlugin[],
  opts: {
    registry?: UnifiedRegistry;
    themeKey?: string | null;
    editing?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <PluginProvider plugins={plugins}>
      <SectionRenderer
        section={node}
        locale="en"
        editing={opts.editing ?? true}
        themeKey={opts.themeKey ?? null}
        registry={opts.registry}
      />
    </PluginProvider>,
  );
}

afterEach(() => {
  clearCommunityPresentations();
});

/**
 * The null-origin island contract, as far as static markup can pin it: an
 * iframe whose sandbox is script-only with no same-origin token, and whose
 * untrusted bundle bytes occur EXACTLY once — inside the sandbox document
 * (`srcdoc`), never inlined into the page DOM.
 */
function expectSandboxIsland(html: string, marker: string) {
  expect(html).toContain("<iframe");
  expect(html).toContain("srcDoc=");
  expect(html.match(new RegExp(marker, "g")) ?? []).toHaveLength(1);
  // Script-only sandbox on the island itself (the `allow-same-origin`
  // mention inside the frame's own comment documents its absence).
  expect(html).toMatch(/sandbox="[^"]*allow-scripts[^"]*"/);
  expect(html).not.toMatch(/sandbox="[^"]*allow-same-origin/);
}

/* ---------------------------------------------------------------- official */

describe("SectionRenderer plugin lanes — official (trusted source-backed)", () => {
  const OFFICIAL_KEY = "plugin:product-reviews/summary";

  function officialInstall() {
    return installedPlugin({
      id: "product-reviews",
      name: "Reviews Test",
      widgets: [{ key: "summary", label: "Summary" }],
    });
  }

  it("renders the sandboxed frame for an installed official widget", () => {
    const html = renderExt(extNode(OFFICIAL_KEY), [officialInstall()], {
      registry: registryWith([pluginDef(OFFICIAL_KEY)]),
    });
    expect(html).toContain("Reviews Test");
    expect(html).not.toContain("Widget preview unavailable");
    // Trusted source-backed: the bundle bytes never reach the page DOM.
    expectSandboxIsland(html, "EZENTRY-9f8");
  });

  it("stays on the placeholder when the official widget is not installed", () => {
    const html = renderExt(extNode(OFFICIAL_KEY), [], {
      registry: registryWith([pluginDef(OFFICIAL_KEY)]),
    });
    // The established PluginBlock labelled placeholder (same UX as the
    // legacy `plugin_block` miss) — explicit and recoverable.
    expect(html).toContain("not installed");
    expect(html).not.toContain("<iframe");
  });
});

/* ---------------------------------------------------------------- isolated */

describe("SectionRenderer plugin lanes — isolated (Class A sandbox)", () => {
  const KEY = "plugin:acme/reviews";

  function isolatedInstall() {
    return installedPlugin({
      id: "acme",
      name: "Acme Test",
      widgets: [{ key: "reviews", label: "Reviews" }],
    });
  }

  it("renders the null-origin island, never page DOM", () => {
    const html = renderExt(extNode(KEY), [isolatedInstall()], {
      registry: registryWith([pluginDef(KEY)]),
    });
    expect(html).toContain("Acme Test");
    expect(html).not.toContain("Widget preview unavailable");
    expectSandboxIsland(html, "EZENTRY-9f8");
  });

  it("never dresses Class A, even with a presentation registered", () => {
    function Dressed(_props: CommunityPresentationProps) {
      return <p data-dressed-acme="yes">must not render</p>;
    }
    registerCommunityPresentation("songoskriti", KEY, Dressed);
    const html = renderExt(extNode(KEY), [isolatedInstall()], {
      registry: registryWith([pluginDef(KEY)]),
      themeKey: "songoskriti",
    });
    expect(html).not.toContain("data-dressed-acme");
    expectSandboxIsland(html, "EZENTRY-9f8");
  });
});

/* --------------------------------------------------------------- themeable */

describe("SectionRenderer plugin lanes — themeable (Class B presentation)", () => {
  const KEY = "plugin:reviews-pro/stars_card";
  const THEME = "proof-alpha";

  function themeableInstall() {
    return installedPlugin({
      id: "reviews-pro",
      name: "Reviews Pro",
      widgets: [{ key: "stars_card", label: "Stars", themeable: true }],
      settings: { rating: 4.5, count: 128 },
    });
  }

  function AlphaStars({ data }: CommunityPresentationProps) {
    return (
      <p data-dressed-stars="yes">
        {String(data.count)} reviews · {String(data.rating)}
      </p>
    );
  }

  it("renders the dressed theme presentation; the bundle never executes", () => {
    registerCommunityPresentation(THEME, KEY, AlphaStars);
    const html = renderExt(extNode(KEY), [themeableInstall()], {
      registry: registryWith([pluginDef(KEY)]),
      themeKey: THEME,
    });
    expect(html).toContain("data-dressed-stars");
    expect(html).toContain("128 reviews");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("EZENTRY-9f8");
    expect(html).not.toContain("Widget preview unavailable");
  });

  it("falls back to the sandboxed island when undressed", () => {
    const html = renderExt(extNode(KEY), [themeableInstall()], {
      registry: registryWith([pluginDef(KEY)]),
      themeKey: "proof-plain",
    });
    expect(html).not.toContain("Widget preview unavailable");
    expectSandboxIsland(html, "EZENTRY-9f8");
  });
});

/* ------------------------------------------------------------- theme-owned */

describe("SectionRenderer plugin lanes — theme-owned stays fail-closed", () => {
  it("owner-definition keeps the explicit placeholder (no approved source)", () => {
    const html = renderExt(extNode("theme:songoskriti/finder"), [], {
      registry: registryWith([
        themeDef("theme:songoskriti/finder", ["songoskriti"]),
      ]),
      themeKey: "songoskriti",
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });
});

/* ------------------------------------------------- resolver mode fidelity */

describe("resolveExtensionForRender — installed-plugin attribution", () => {
  const KEY = "plugin:acme/faq";

  function themeableInstall(): InstalledPlugin {
    return installedPlugin({
      id: "acme",
      name: "Acme",
      widgets: [{ key: "faq", label: "FAQ", themeable: true }],
      settings: { heading: "Help" },
    });
  }

  it("attributes Class B as plugin-themeable when installs are passed", () => {
    const registry = registryWith([pluginDef(KEY)]);
    const out = resolveExtensionForRender(
      extNode(KEY) as Section,
      null,
      registry,
      {
        installedPlugins: [themeableInstall()],
      },
    );
    expect(out?.ok).toBe(true);
    if (out?.ok && out.mode === "plugin-themeable") {
      expect(out.dressed).toBe(false);
    } else {
      expect.unreachable("expected plugin-themeable");
    }
  });

  it("defaults to the fail-safe isolated sandbox without installs (unchanged)", () => {
    const registry = registryWith([pluginDef(KEY)]);
    const out = resolveExtensionForRender(
      extNode(KEY) as Section,
      null,
      registry,
    );
    expect(out?.ok).toBe(true);
    if (out?.ok) {
      expect(out.mode).toBe("plugin-isolated");
    } else {
      expect.unreachable("expected a hit");
    }
  });
});
