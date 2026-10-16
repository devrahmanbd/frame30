/**
 * ThemeRuntime host liveness — freshness + suspension reach the bridge.
 *
 * - The host call site forwards a clock (`now ?? Date.now()`) and the
 *   install's live `suspended` flag into `handleThemeMessage` (previously
 *   neither was passed: freshness declared-not-enforced, suspension
 *   consulted-but-never-live at the client).
 * - `ThemeWidgetPreview` forwards both to its inner frame for the same
 *   per-message liveness on widget mounts.
 * - Rendering is unchanged: the sandboxed iframe contract (allow-scripts
 *   only, immutable version-pinned URL, no srcDoc) is pinned byte-identical.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

const DIR = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(DIR, f), "utf8");

import { ThemeRuntime } from "./ThemeRuntime";

const ORIGIN = "https://themes.example-cdn.com";

function frame(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ThemeRuntime, {
      title: "Acme custom theme",
      assetOrigin: ORIGIN,
      theme: { name: "acme-custom", version: "1.4.0" },
      granted: ["theme:storefront:read"],
      navigateAllowlist: [],
      onCall: async () => ({ ok: true }),
      ...extra,
    } as never),
  );
}

describe("ThemeRuntime host liveness — now + suspended reach the bridge", () => {
  it("forwards the host clock and suspension into handleThemeMessage", () => {
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).toContain("now: now ?? Date.now()");
    expect(tsx).toContain("suspended,");
    expect(tsx).toMatch(/handleThemeMessage\(data, \{[^}]*now:[^}]*suspended/s);
  });

  it("declares now/suspended on both frame prop types", () => {
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).toContain("ThemeRuntimeProps");
    expect(tsx).toContain("ThemeWidgetPreviewProps");
    const nowCount = (tsx.match(/now\?: number;/g) ?? []).length;
    expect(nowCount).toBeGreaterThanOrEqual(2);
    const suspCount = (tsx.match(/suspended\?: boolean;/g) ?? []).length;
    expect(suspCount).toBeGreaterThanOrEqual(2);
  });

  it("widget preview forwards both to its inner frame", () => {
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).toMatch(/now=\{now\}[\s\S]*suspended=\{suspended\}/);
  });

  it("renders the identical sandboxed iframe contract (no srcDoc, allow-scripts only)", () => {
    for (const html of [
      frame(),
      frame({ now: 1 }),
      frame({ suspended: true }),
    ]) {
      expect(html).toContain("<iframe");
      expect(html).toContain('sandbox="allow-scripts"');
      expect(html).toContain(`${ORIGIN}/t/acme-custom/1.4.0/index.html`);
      expect(html).not.toContain("allow-same-origin");
      expect(html).not.toContain("srcdoc");
    }
  });
});
