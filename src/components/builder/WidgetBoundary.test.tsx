/** Phase 8.8 — failure policy: one broken widget never takes the page down. */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetBoundary } from "./WidgetBoundary";

function markup(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

describe("WidgetBoundary", () => {
  it("renders its widget untouched when nothing throws", () => {
    expect(markup(<WidgetBoundary type="hero"><p>ok</p></WidgetBoundary>)).toContain("ok");
  });

  it("flips to the failed state from a thrown render error", () => {
    expect(WidgetBoundary.getDerivedStateFromError(new Error("boom"))).toEqual({
      failed: true,
      message: "boom",
    });
  });

  it("shows a space-reserving placeholder on the storefront and a reason in the studio", () => {
    const store = new WidgetBoundary({ type: "product_rail", children: null });
    store.state = { failed: true, message: "boom" };
    expect(markup(store.render() as React.ReactElement)).toContain('data-widget-failed="product_rail"');

    const studio = new WidgetBoundary({ type: "product_rail", editing: true, children: null });
    studio.state = { failed: true, message: "boom" };
    const html = markup(studio.render() as React.ReactElement);
    expect(html).toContain("product_rail");
    expect(html).toContain("role=\"note\"");
  });
});
