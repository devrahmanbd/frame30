/**
 * ThemeWidgetPreview — editor preview for uploaded-theme widgets (frame30).
 *
 * Preview strategy (pinned here): a theme-owned widget NEVER executes in
 * page DOM. The preview renders the SAME sandboxed ThemeRuntime frame
 * (immutable URL, `allow-scripts` only, no srcDoc) and delivers the intended
 * component id + validated instance data as a versioned bridge envelope to
 * the OWNED frame only. Browser-truthful limits follow the attack suite
 * (`ThemeRuntime.attack.test.ts`): under node we pin SSR markup + static
 * source invariants + envelope behavior, never a live null-origin frame.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildThemeGrants } from "./capabilities";
import { buildThemeFrameUrl, THEME_SANDBOX } from "./ThemeRuntime";
import { ThemeWidgetPreview } from "./ThemeRuntime";
import { buildThemePreviewEnvelope } from "./bridge-v2";

const DIR = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(DIR, "ThemeRuntime.tsx"), "utf8");

const ORIGIN = "https://themes.example-cdn.com";
const THEME = { name: "aurora-lookbook", version: "1.0.0" };
const GRANTS = buildThemeGrants({ storefrontRead: true });

function previewProps(over: Record<string, unknown> = {}) {
  return {
    assetOrigin: ORIGIN,
    theme: THEME,
    widgetId: "theme:aurora-lookbook/hero",
    component: "HeroCanvas",
    instanceProps: { headline: "Hello" },
    granted: GRANTS.granted,
    onCall: async () => ({}),
    ...over,
  };
}

describe("ThemeWidgetPreview — sandboxed frame, never page DOM", () => {
  it("renders the immutable theme frame with the exact sandbox tokens", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeWidgetPreview, previewProps()),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain(`src="${buildThemeFrameUrl(ORIGIN, THEME)}"`);
    expect(html).toContain(`sandbox="${THEME_SANDBOX}"`);
    expect(THEME_SANDBOX).toBe("allow-scripts");
  });

  it("inlines no theme code (no srcDoc, no scripts, no inner HTML)", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeWidgetPreview, previewProps()),
    );
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("HeroCanvas");
    // Static source invariants: the preview file adds no new sandbox
    // tokens and no inline-code path anywhere in the module.
    expect(tsx).not.toMatch(/srcDoc\s*=/);
    expect(tsx).not.toContain("dangerouslySetInnerHTML");
    expect(tsx).not.toMatch(/["']allow-same-origin["']/);
  });

  it("renders nothing without a valid immutable URL (fail closed)", () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeWidgetPreview,
        previewProps({ theme: { name: "aurora-lookbook", version: "latest" } }),
      ),
    );
    expect(html).toBe("");
  });

  it("posts only to the owned frame with a validated envelope (source invariants)", () => {
    // The preview effect posts the built envelope — never raw props — to
    // the owned frame window with the opaque-origin "*" rationale; an
    // invalid envelope posts nothing.
    expect(tsx).toContain("buildThemePreviewEnvelope");
    expect(tsx).toContain("contentWindow?.postMessage");
    expect(tsx).not.toMatch(/postMessage\(\s*props/);
    expect(tsx).not.toMatch(/postMessage\(\s*instanceProps/);
  });

  it("delivers the intended component id + validated data (payload assertion)", () => {
    const built = buildThemePreviewEnvelope({
      widgetId: "theme:aurora-lookbook/hero",
      component: "HeroCanvas",
      props: { headline: "Hello" },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope).toMatchObject({
      v: 2,
      widgetId: "theme:aurora-lookbook/hero",
      component: "HeroCanvas",
      props: { headline: "Hello" },
    });
  });
});
