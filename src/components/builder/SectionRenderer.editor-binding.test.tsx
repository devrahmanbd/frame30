/**
 * Frame30 Level B Pass 3 — host wiring seams (TDD).
 *
 * - EDITOR: the builder route completes the server-projected binding inputs
 *   with a least-privilege host (`granted: []` + deny-all `onCall`). This
 *   pins the seam contract: an editor-style binding still mounts the
 *   sandboxed frame at the pinned URL (preview works, height flows via
 *   postMessage outside the bridge), while EVERY bridge method refuses —
 *   first at authorize time (`scope_denied`, grants empty), and at the
 *   backstop (`theme.denied`).
 * - STOREFRONT: `ThemeChrome` forwards an optional `devThemeBinding` to
 *   every section renderer without changing the classic path. With no
 *   producer yet (no storefront loader projection, no storefront `onCall`
 *   with server revalidation), the prop stays absent and uploaded-theme
 *   widgets keep the fail-closed path — asserted here so a future producer
 *   cannot silently change today's behavior without updating this suite.
 */
import { describe, expect, it, vi } from "vitest";
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
        {
          href: typeof to === "string" ? to : "/",
          ...rest,
        },
        children as never,
      );
    },
  };
});

import type { Section } from "@/lib/builder-ast";
import { SectionRenderer, type DevThemeBinding } from "./SectionRenderer";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
} from "@/lib/unified-widget-registry";
import { fromDevThemeManifest } from "@/lib/dev-theme-widgets";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";
import {
  createThemeGuard,
  handleThemeMessage,
} from "../theme-runtime/bridge-v2";
import { ThemeChrome } from "../store/ThemeChrome";

function manifest(over: Record<string, unknown> = {}) {
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

/** Mirror of the builder route's editor host: no scopes, deny-all calls. */
function editorBinding(): DevThemeBinding {
  return {
    assetOrigin: "https://themes-cdn.example.com",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: [],
    navigateAllowlist: [],
    onCall: async () => {
      throw new Error("theme.denied");
    },
  };
}

function registryWithManifest(): UnifiedRegistry {
  const verdict = fromDevThemeManifest(manifest());
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error("fixture manifest refused");
  const reg = createWidgetRegistry();
  for (const def of verdict.defs) {
    expect(reg.registerWidget(def).ok).toBe(true);
  }
  return reg;
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

describe("editor binding — preview works, every bridge call refuses", () => {
  it("mounts the sandboxed frame at the pinned URL (height flows outside the bridge)", () => {
    const html = renderToStaticMarkup(
      <SectionRenderer
        section={extNode("theme:aurora-lookbook/hero", { kicker: "Drop" })}
        locale="en"
        editing
        themeKey="aurora-lookbook"
        registry={registryWithManifest()}
        devThemeBinding={editorBinding()}
      />,
    );
    expect(html).not.toContain("Widget preview unavailable");
    expect(html).toContain("<iframe");
    expect(html).toMatch(/sandbox="[^"]*allow-scripts[^"]*"/);
    expect(html).not.toMatch(/sandbox="[^"]*allow-same-origin/);
    expect(html).toContain("/t/aurora-lookbook/1.0.0/");
    expect(html).not.toContain("HeroCanvas(");
  });

  it("denies bridge calls at authorize time and at the backstop", async () => {
    const binding = editorBinding();
    const guard = createThemeGuard();
    // Empty grants: the authorizer refuses before onCall is ever reached.
    const scoped = await handleThemeMessage(
      { v: 2, id: "a1", method: "cart.add", params: {} },
      {
        granted: binding.granted,
        navigateAllowlist: [],
        onCall: binding.onCall,
        guard,
      },
    );
    expect(scoped).toEqual({ error: "theme.scope_denied" });
    // Backstop: even an authorized call reaching the editor host is denied.
    const direct = await handleThemeMessage(
      { v: 2, id: "a2", method: "storefront.read", params: {} },
      {
        granted: ["theme:storefront:read"],
        navigateAllowlist: [],
        onCall: binding.onCall,
        guard: createThemeGuard(),
      },
    );
    expect(direct).toEqual({ error: "theme.denied" });
  });
});

describe("ThemeChrome devThemeBinding — forwarded, producer-less, placeholder-preserving", () => {
  const heading = {
    id: "s1",
    type: "heading",
    props: { heading: "Hello" },
  } as unknown as Section;

  function chrome(binding: DevThemeBinding | null, sections: Section[]) {
    return renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "index",
        ast: { header: [], main: sections, footer: [] },
        tokens: {},
        storeSlug: "acme",
        themeKey: "aurora-lookbook",
        merchantId: null,
        siteKit: null,
        fallback: createElement("div", null, "fallback-body"),
        ...(binding ? { devThemeBinding: binding } : {}),
      } as never),
    );
  }

  it("classic render is identical with and without the prop", () => {
    const without = chrome(null, [heading]);
    const withBinding = chrome(editorBinding(), [heading]);
    for (const html of [without, withBinding]) {
      expect(html).toContain('data-fq-node="s1"');
      expect(html).toContain("<h1");
      expect(html).not.toContain("<iframe");
    }
    expect(withBinding).toBe(without);
  });

  it("an uploaded-theme node without a resolvable def mounts no frame either way", () => {
    const node = extNode("theme:aurora-lookbook/hero", { kicker: "Hi" });
    for (const html of [
      chrome(null, [node]),
      chrome(editorBinding(), [node]),
    ]) {
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("HeroCanvas(");
    }
  });
});
