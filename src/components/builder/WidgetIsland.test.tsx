/** Phase 8 — island hydration: the server always emits complete markup. */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { WidgetIsland } from "./WidgetIsland";
import { hydrationMode } from "@/lib/widget-hydration";

function markup(mode: Parameters<typeof WidgetIsland>[0]["mode"], type: string) {
  return renderToStaticMarkup(
    <WidgetIsland mode={mode} type={type}>
      <p>server copy</p>
    </WidgetIsland>,
  );
}

describe("WidgetIsland", () => {
  it("renders the widget markup for a never-hydrating widget", () => {
    const html = markup("static", "rich_text");
    expect(html).toContain("server copy");
    expect(html).toContain('data-hydrate="static"');
  });

  it("renders the widget markup for deferred modes too", () => {
    for (const mode of ["visible", "interaction"] as const) {
      expect(markup(mode, "product_rail")).toContain("server copy");
    }
  });

  it("marks eager widgets as hydrated from the first paint", () => {
    expect(markup("eager", "add_to_cart")).toContain('data-hydrated="true"');
  });

  it("uses the registry policy for the widget it wraps", () => {
    expect(markup(hydrationMode("rich_text"), "rich_text")).toContain('data-hydrate="static"');
    expect(markup(hydrationMode("accordion"), "accordion")).toContain('data-hydrate="interaction"');
  });
});
