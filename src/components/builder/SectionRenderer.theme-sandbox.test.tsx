/**
 * Frame30 integrator follow-up — SectionRenderer Level B uploaded-theme
 * sandbox branch (TDD).
 *
 * A `theme:<id>/...` def with `renderer: "custom"` (inert `themeId` /
 * `themeComponent` surviving the registry allow-list) plus a
 * server-projected binding whose pinned identity AND version match renders
 * ONLY through the sandboxed `ThemeWidgetPreview` — never page-DOM
 * execution. Everything else (unbound, version-skewed, foreign-bound,
 * hostile props) keeps the explicit placeholder.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Section } from "@/lib/builder-ast";
import { SectionRenderer, type DevThemeBinding } from "./SectionRenderer";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
} from "@/lib/unified-widget-registry";
import { fromDevThemeManifest } from "@/lib/dev-theme-widgets";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";

/* --------------------------------------------------------------- fixtures */

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
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

function registryWithManifest(
  input: Record<string, unknown> = {},
): UnifiedRegistry {
  const verdict = fromDevThemeManifest(manifest(input));
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture manifest refused");
  const reg = createWidgetRegistry();
  for (const def of verdict.defs) {
    const registered = reg.registerWidget(def);
    expect(registered.ok).toBe(true);
  }
  return reg;
}

function binding(over: Partial<DevThemeBinding> = {}): DevThemeBinding {
  return {
    assetOrigin: "https://themes-cdn.example.com",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: [],
    navigateAllowlist: [],
    onCall: () => Promise.resolve({ result: null }),
    ...over,
  };
}

function extNode(widgetKey: string, props: Record<string, unknown>) {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "inst-1",
    owner: { kind: "theme", id: "aurora-lookbook" },
    widgetKey,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

function render(
  node: Section,
  opts: { registry?: UnifiedRegistry; binding?: DevThemeBinding } = {},
): string {
  return renderToStaticMarkup(
    <SectionRenderer
      section={node}
      locale="en"
      editing
      themeKey="aurora-lookbook"
      registry={opts.registry}
      devThemeBinding={opts.binding}
    />,
  );
}

const WIDGET = "theme:aurora-lookbook/hero";

/* ------------------------------------------------------------------ tests */

describe("SectionRenderer Level B uploaded-theme sandbox branch", () => {
  it("component metadata survives registry allow-listing", () => {
    const reg = registryWithManifest();
    const def = reg.getWidget(WIDGET);
    expect(def?.themeId).toBe("aurora-lookbook");
    expect(def?.themeComponent).toBe("HeroCanvas");
  });

  it("bound + approved renders the sandboxed frame, never the placeholder", () => {
    const html = render(
      extNode(WIDGET, { kicker: "New drop", headline: "Hello" }),
      { registry: registryWithManifest(), binding: binding() },
    );
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).toContain("<iframe");
    expect(html).toMatch(/sandbox="[^"]*allow-scripts[^"]*"/);
    expect(html).not.toMatch(/sandbox="[^"]*allow-same-origin/);
    expect(html).toContain("/t/aurora-lookbook/1.0.0/");
    // No theme code in the host document.
    expect(html).not.toContain("HeroCanvas(");
  });

  it("unbound render keeps the explicit placeholder", () => {
    const html = render(extNode(WIDGET, { kicker: "Hi" }), {
      registry: registryWithManifest(),
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });

  it("version-skewed binding keeps the placeholder", () => {
    const html = render(extNode(WIDGET, { kicker: "Hi" }), {
      registry: registryWithManifest(),
      binding: binding({
        theme: { name: "aurora-lookbook", version: "2.0.0" },
      }),
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });

  it("foreign-theme binding keeps the placeholder", () => {
    const html = render(extNode(WIDGET, { kicker: "Hi" }), {
      registry: registryWithManifest(),
      binding: binding({ theme: { name: "other-theme", version: "1.0.0" } }),
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });

  it("hostile instance props are neutralized before the sandbox", () => {
    const html = render(
      extNode(WIDGET, {
        kicker: "<script>alert(1)</script>Drop",
        headline: { __proto__: { polluted: true } },
        unknownKey: "dropped",
      }),
      { registry: registryWithManifest(), binding: binding() },
    );
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("unknownKey");
    expect((Object.prototype as Record<string, unknown>).polluted).toBe(
      undefined,
    );
  });

  it("malformed component token drops at registration (placeholder, never executes)", () => {
    const reg = createWidgetRegistry();
    const verdict = reg.registerWidget({
      id: "theme:aurora-lookbook/evil",
      namespace: "theme",
      version: "1.0.0",
      label: "Evil",
      category: "aurora-lookbook",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "custom",
      themes: ["aurora-lookbook"],
      themeId: "aurora-lookbook",
      themeComponent: "https://evil.example/x.js",
    });
    expect(verdict.ok).toBe(true);
    expect(reg.getWidget("theme:aurora-lookbook/evil")?.themeComponent).toBe(
      undefined,
    );
  });
});
