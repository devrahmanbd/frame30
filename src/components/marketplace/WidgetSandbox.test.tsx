/**
 * WidgetSandbox SSR shell — TDD: the sandbox must render its iframe shell
 * during server rendering (no `window` access at render time), because
 * storefront pages SSR plugin islands before hydration.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetSandbox } from "./WidgetSandbox";

describe("WidgetSandbox SSR shell", () => {
  it("renders the iframe without touching window", () => {
    const html = renderToStaticMarkup(
      createElement(WidgetSandbox, {
        title: "WhatsApp Chat Bubble",
        entry: "framique.mount(document.createElement('div'))",
        grantedScopes: ["render_storefront"],
        onCall: async () => ({ ok: true }),
        height: 80,
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("WhatsApp Chat Bubble");
  });

  it("serves validated plugin settings to the plugin.settings bridge call", async () => {
    const { authorizeWidgetCall } = await import("@/lib/marketplace-scopes");
    expect(
      authorizeWidgetCall(
        { v: 1, id: "1", method: "plugin.settings" },
        ["render_storefront"],
      ),
    ).toEqual({ allowed: true, method: "plugin.settings", write: false });
    expect(
      authorizeWidgetCall(
        { v: 1, id: "1", method: "plugin.settings" },
        ["read_orders"],
      ).allowed,
    ).toBe(false);
  });

  it("rejects malformed plugin.settings calls", async () => {
    const { authorizeWidgetCall } = await import("@/lib/marketplace-scopes");
    expect(
      authorizeWidgetCall({ v: 1, method: "plugin.settings" }, [
        "render_storefront",
      ]),
    ).toEqual({ allowed: false, reason: "malformed" });
  });
});
