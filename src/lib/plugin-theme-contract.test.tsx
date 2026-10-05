/**
 * Community classes — Class A isolated (keep) + Class B themeable (new).
 *
 * - Contract declaration: the manifest gate accepts a well-formed v1
 *   `themeable` declaration (contract version + schema refs) and rejects
 *   malformed ones; absence keeps the Class A widget shape unchanged.
 * - Resolution: themeable + dressed → theme presentation; themeable +
 *   undressed → generic island fallback; non-themeable → sandbox
 *   (unchanged); blocked → placeholder (unchanged five failure modes).
 * - Both-themes proof: the same fixture install renders two different
 *   theme presentations from identical data through the PluginBlock path.
 * - Isolation regression: Class A still renders the sandboxed island even
 *   when a theme key is set and other presentations are registered.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  defaultSettings,
  parseManifest,
  resolvePluginWidget,
  type InstalledPlugin,
} from "./plugin-manifest";
import {
  clearCommunityPresentations,
  isPluginThemeContract,
  normalizeThemeContract,
  pluginWidgetClass,
  registerCommunityPresentation,
  resolveCommunityPresentation,
  resolveCommunityRender,
  type CommunityPresentationProps,
} from "./plugin-theme-contract";
import { PluginBlock } from "@/components/builder/PluginBlock";
import { PluginProvider } from "@/components/builder/PluginContext";

const THEME_A = "proof-alpha";
const THEME_B = "proof-beta";
const UNDRESSED = "proof-plain";

const THEMEABLE_MANIFEST = {
  id: "reviews-pro",
  name: "Reviews Pro",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [
    {
      key: "stars_card",
      label: "Stars card",
      slots: ["main"],
      entry: "framique.mount(document.createTextNode('stars'))",
      themeable: {
        version: 1,
        schema: "plugin:reviews-pro/stars_card/schema.json",
        data: "plugin:reviews-pro/stars_card/data.json",
        actions: ["submit"],
        slots: ["header"],
        states: ["loading", "empty", "ready"],
      },
    },
  ],
  hooks: [],
  settings: [
    { key: "rating", label: "Rating", kind: "number", default: 4.5 },
    { key: "count", label: "Reviews", kind: "number", default: 128 },
  ],
  i18n: { en: {}, bn: {} },
};

const ISOLATED_MANIFEST = {
  id: "chat-pro",
  name: "Chat Pro",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [
    {
      key: "chat_bubble",
      label: "Chat bubble",
      slots: ["footer"],
      entry: "framique.mount(document.createTextNode('chat'))",
    },
  ],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

const THEMEABLE_KEY = "plugin:reviews-pro/stars_card";
const ISOLATED_KEY = "plugin:chat-pro/chat_bubble";

function installedOf(manifest: unknown): InstalledPlugin {
  const verdict = parseManifest(manifest);
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: `install-${verdict.manifest.id}`,
    manifest: verdict.manifest,
    grantedScopes: verdict.manifest.permissions,
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
  };
}

function AlphaStars({ data }: CommunityPresentationProps) {
  return (
    <p data-presentation="alpha">
      {String(data.count)} reviews · {String(data.rating)}
    </p>
  );
}

function BetaStars({ data }: CommunityPresentationProps) {
  return (
    <article data-presentation="beta">
      <span>
        {String(data.rating)} ({String(data.count)})
      </span>
    </article>
  );
}

function renderBlock(
  plugins: InstalledPlugin[],
  pluginKey: string,
  themeKey?: string | null,
  editing = false,
) {
  return renderToStaticMarkup(
    createElement(PluginProvider, {
      plugins,
      children: createElement(PluginBlock, {
        pluginKey,
        height: 200,
        editing,
        themeKey,
      }),
    }),
  );
}

afterEach(() => {
  clearCommunityPresentations();
  vi.restoreAllMocks();
});

describe("contract declaration (manifest gate)", () => {
  it("accepts a well-formed v1 themeable declaration and normalises it", () => {
    const verdict = parseManifest(THEMEABLE_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const widget = verdict.manifest.widgets[0]!;
    expect(pluginWidgetClass(widget)).toBe("themeable");
    expect(widget.themeable).toEqual({
      version: 1,
      schema: "plugin:reviews-pro/stars_card/schema.json",
      data: "plugin:reviews-pro/stars_card/data.json",
      actions: ["submit"],
      slots: ["header"],
      states: ["loading", "empty", "ready"],
    });
    // The sandbox entry survives untouched: the island fallback needs it.
    expect(widget.entry).toContain("framique.mount");
  });

  it("accepts a minimal declaration (version + schema only)", () => {
    const verdict = parseManifest({
      ...THEMEABLE_MANIFEST,
      widgets: [
        {
          ...THEMEABLE_MANIFEST.widgets[0],
          themeable: { version: 1, schema: "schema.json" },
        },
      ],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.widgets[0]!.themeable).toEqual({
      version: 1,
      schema: "schema.json",
    });
  });

  it("rejects malformed declarations without touching valid widgets", () => {
    const bad: unknown[] = [
      { version: 2, schema: "schema.json" }, // unknown future version
      { schema: "schema.json" }, // missing version
      { version: 1 }, // missing schema
      { version: 1, schema: "" }, // empty schema
      { version: 1, schema: "schema.json", actions: "submit" }, // not a list
      { version: 1, schema: "schema.json", actions: [""] }, // empty name
      { version: 1, schema: "schema.json", slots: [] }, // empty list
      { version: 1, schema: "schema.json", states: [42] }, // non-string
      { version: 1, schema: "schema.json", data: "" }, // empty data ref
      "themeable", // not an object
    ];
    for (const themeable of bad) {
      const verdict = parseManifest({
        ...THEMEABLE_MANIFEST,
        widgets: [{ ...THEMEABLE_MANIFEST.widgets[0], themeable }],
      });
      expect(verdict.ok, JSON.stringify(themeable)).toBe(false);
      if (!verdict.ok) expect(verdict.errors).toContain("widgets[0].themeable");
    }
    expect(isPluginThemeContract({ version: 2, schema: "s" })).toBe(false);
    expect(normalizeThemeContract("themeable")).toBeNull();
  });

  it("leaves Class A widgets without a themeable key (shape unchanged)", () => {
    const verdict = parseManifest(ISOLATED_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const widget = verdict.manifest.widgets[0]!;
    expect("themeable" in widget).toBe(false);
    expect(pluginWidgetClass(widget)).toBe("isolated");
  });
});

describe("resolution branches", () => {
  it("keeps every blocked mode as a placeholder decision (unchanged)", () => {
    const themeable = installedOf(THEMEABLE_MANIFEST);
    const cases: [string, InstalledPlugin[], string][] = [
      ["nonsense", [themeable], "bad_key"],
      [THEMEABLE_KEY, [], "not_installed"],
      ["plugin:reviews-pro/ghost", [themeable], "unknown_widget"],
      [THEMEABLE_KEY, [{ ...themeable, enabled: false }], "disabled"],
      [
        THEMEABLE_KEY,
        [
          {
            ...themeable,
            manifest: { ...themeable.manifest, api: "^2.0.0" },
          },
        ],
        "incompatible",
      ],
    ];
    for (const [key, plugins, reason] of cases) {
      const decision = resolveCommunityRender(
        resolvePluginWidget(key, plugins),
        { themeKey: THEME_A, pluginKey: key },
      );
      expect(decision.kind).toBe("blocked");
      if (decision.kind === "blocked") expect(decision.reason).toBe(reason);
    }
  });

  it("resolves non-themeable widgets to the sandbox (Class A unchanged)", () => {
    const isolated = installedOf(ISOLATED_MANIFEST);
    // Even with a theme key and a registered presentation for another
    // widget, Class A never dresses: no cross-widget leak.
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    const decision = resolveCommunityRender(
      resolvePluginWidget(ISOLATED_KEY, [isolated]),
      { themeKey: THEME_A, pluginKey: ISOLATED_KEY },
    );
    expect(decision).toEqual({ kind: "sandbox" });
  });

  it("resolves themeable + undressed widgets to the island fallback", () => {
    const themeable = installedOf(THEMEABLE_MANIFEST);
    const resolution = resolvePluginWidget(THEMEABLE_KEY, [themeable]);
    // No theme key at all (legacy callers): island, never unstyled markup.
    expect(
      resolveCommunityRender(resolution, { pluginKey: THEMEABLE_KEY }),
    ).toEqual({ kind: "island" });
    // Unknown theme: island, never another theme's brand.
    expect(
      resolveCommunityRender(resolution, {
        themeKey: "no-such-theme",
        pluginKey: THEMEABLE_KEY,
      }),
    ).toEqual({ kind: "island" });
    // Known theme that simply didn't dress this widget: island.
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    expect(
      resolveCommunityRender(resolution, {
        themeKey: UNDRESSED,
        pluginKey: THEMEABLE_KEY,
      }),
    ).toEqual({ kind: "island" });
  });

  it("resolves themeable + dressed widgets to the theme presentation", () => {
    const themeable = installedOf(THEMEABLE_MANIFEST);
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    const decision = resolveCommunityRender(
      resolvePluginWidget(THEMEABLE_KEY, [themeable]),
      { themeKey: THEME_A, pluginKey: THEMEABLE_KEY },
    );
    expect(decision).toEqual({ kind: "theme", themeKey: THEME_A });
  });

  it("honours an explicit hasPresentation seam and never throws", () => {
    const themeable = installedOf(THEMEABLE_MANIFEST);
    const resolution = resolvePluginWidget(THEMEABLE_KEY, [themeable]);
    expect(
      resolveCommunityRender(resolution, {
        themeKey: THEME_A,
        pluginKey: THEMEABLE_KEY,
        hasPresentation: () => true,
      }),
    ).toEqual({ kind: "theme", themeKey: THEME_A });
    expect(
      resolveCommunityRender(resolution, {
        themeKey: THEME_A,
        pluginKey: THEMEABLE_KEY,
        hasPresentation: () => {
          throw new Error("registry down");
        },
      }),
    ).toEqual({ kind: "island" });
    expect(() =>
      resolveCommunityRender(null, { themeKey: THEME_A }),
    ).not.toThrow();
    expect(resolveCommunityRender(null, { themeKey: THEME_A }).kind).toBe(
      "blocked",
    );
    expect(() =>
      resolveCommunityRender("junk" as never, { themeKey: THEME_A }),
    ).not.toThrow();
  });
});

describe("community presentation registry", () => {
  it("resolves a registered theme × widget pair and isolates per theme", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    registerCommunityPresentation(THEME_B, THEMEABLE_KEY, BetaStars);
    expect(resolveCommunityPresentation(THEME_A, THEMEABLE_KEY)).toBe(
      AlphaStars,
    );
    expect(resolveCommunityPresentation(THEME_B, THEMEABLE_KEY)).toBe(
      BetaStars,
    );
  });

  it("falls back instead of leaking across themes or widgets", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    expect(
      resolveCommunityPresentation("no-such-theme", THEMEABLE_KEY, AlphaStars),
    ).toBe(AlphaStars);
    expect(resolveCommunityPresentation("no-such-theme", THEMEABLE_KEY)).toBe(
      undefined,
    );
    expect(resolveCommunityPresentation(null, THEMEABLE_KEY)).toBe(undefined);
    expect(resolveCommunityPresentation(THEME_A, ISOLATED_KEY)).toBe(undefined);
  });

  it("warns on duplicates and keeps the first registration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, BetaStars);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(resolveCommunityPresentation(THEME_A, THEMEABLE_KEY)).toBe(
      AlphaStars,
    );
  });

  it("never throws on invalid registration or resolution", () => {
    expect(() =>
      registerCommunityPresentation("", THEMEABLE_KEY, AlphaStars),
    ).not.toThrow();
    expect(() =>
      registerCommunityPresentation(THEME_A, "", AlphaStars),
    ).not.toThrow();
    expect(() =>
      registerCommunityPresentation(THEME_A, THEMEABLE_KEY, null as never),
    ).not.toThrow();
    expect(resolveCommunityPresentation(THEME_A, THEMEABLE_KEY)).toBe(
      undefined,
    );
    expect(() =>
      resolveCommunityPresentation("no-such-theme", THEMEABLE_KEY),
    ).not.toThrow();
  });

  it("names no theme and branches on no theme", () => {
    const src = readFileSync("src/lib/plugin-theme-contract.ts", "utf8");
    expect(src).not.toMatch(/songoskriti|somvabona/i);
    expect(src).not.toMatch(/theme-widgets/);
    const withoutTypeGuards = src
      .replace(/typeof\s+themeKey\s*!==?\s*"string"/g, "")
      .replace(/typeof\s+opts\?\.themeKey\s*===\s*"string"/g, "")
      .replace(/typeof\s+opts\?\.pluginKey\s*===\s*"string"/g, "");
    expect(withoutTypeGuards).not.toMatch(/themeKey\s*(===|!==|==|!=)/);
    expect(src).not.toMatch(/switch\s*\([^)]*theme/);
  });
});

describe("both-themes proof (same data, two presentations)", () => {
  it("renders different markup with identical data through PluginBlock", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    registerCommunityPresentation(THEME_B, THEMEABLE_KEY, BetaStars);
    const plugins = [installedOf(THEMEABLE_MANIFEST)];

    const alpha = renderBlock(plugins, THEMEABLE_KEY, THEME_A);
    const beta = renderBlock(plugins, THEMEABLE_KEY, THEME_B);

    expect(alpha).toContain('data-presentation="alpha"');
    expect(beta).toContain('data-presentation="beta"');
    expect(alpha).not.toBe(beta);
    // Identical data: both carry the install's validated settings values.
    expect(alpha).toContain("128");
    expect(beta).toContain("128");
    expect(alpha).toContain("4.5");
    expect(beta).toContain("4.5");
    // Dressed path executes no bundle: no sandboxed island.
    expect(alpha).not.toContain("<iframe");
    expect(beta).not.toContain("<iframe");
  });

  it("falls back to the generic sandboxed island when undressed", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    const plugins = [installedOf(THEMEABLE_MANIFEST)];
    const html = renderBlock(plugins, THEMEABLE_KEY, UNDRESSED);
    expect(html).toContain("<iframe");
    expect(html).toContain('data-plugin="reviews-pro"');
    expect(html).not.toContain("data-presentation=");
  });

  it("keeps the legacy sandbox island without a theme key (byte-identical path)", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    const plugins = [installedOf(THEMEABLE_MANIFEST)];
    const html = renderBlock(plugins, THEMEABLE_KEY);
    expect(html).toContain("<iframe");
    expect(html).not.toContain("data-presentation=");
  });
});

describe("isolation regression (Class A still sandboxed)", () => {
  it("renders the iframe island even when a theme key is set", () => {
    registerCommunityPresentation(THEME_A, THEMEABLE_KEY, AlphaStars);
    const plugins = [
      installedOf(ISOLATED_MANIFEST),
      installedOf(THEMEABLE_MANIFEST),
    ];
    const html = renderBlock(plugins, ISOLATED_KEY, THEME_A);
    expect(html).toContain("<iframe");
    expect(html).toContain("Chat Pro — Chat bubble");
    // No theme presentation leaks into the isolated widget.
    expect(html).not.toContain("data-presentation=");
  });

  it("renders placeholders for blocked widgets (unchanged)", () => {
    const plugins = [installedOf(THEMEABLE_MANIFEST)];
    const html = renderBlock(
      plugins,
      "plugin:reviews-pro/ghost",
      THEME_A,
      true,
    );
    expect(html).toContain("no longer ships this block");
    expect(html).not.toContain("<iframe");
  });
});
