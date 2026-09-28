/**
 * T1 stored-XSS exploit proofs for renderBuilderHtml (shopper render path:
 * ArticleBody:195, PageView:86, StoreHomepage:72 via dangerouslySetInnerHTML).
 *
 * RED pre-fix: raw payloads render verbatim. GREEN post-fix: every payload
 * is inert (escaped / scheme-gated / blocked) while benign plain-text
 * content renders byte-identical.
 */
import { describe, expect, it } from "vitest";
import { renderBuilderHtml } from "./page-builder";

function docWith(widget: Record<string, unknown>) {
  return {
    sections: [
      { id: "s1", columns: [{ id: "c1", width: 1, widgets: [widget] }] },
    ],
  };
}

const render = (widget: Record<string, unknown>) =>
  renderBuilderHtml(docWith(widget) as never);

describe("page-builder stored XSS (T1)", () => {
  it("neutralizes <script> in heading text", () => {
    const html = render({
      kind: "heading",
      settings: { text: "<script>alert(1)</script>", level: 2 },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralizes event-handler breakout in text widgets", () => {
    const html = render({
      kind: "text",
      settings: { text: 'x"><img src=x onerror=alert(1)>' },
    });
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).toContain("&lt;img");
  });

  it("gates javascript: hrefs on button widgets", () => {
    const html = render({
      kind: "button",
      settings: { label: "Click", href: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("gates whitespace/case-obfuscated javascript: hrefs", () => {
    const html = render({
      kind: "button",
      settings: { label: "Click", href: "  \n JaVaScRiPt:alert(1)" },
    });
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("gates javascript: img src", () => {
    const html = render({
      kind: "image",
      settings: { src: "javascript:alert(1)", alt: 'x" onerror="alert(1)' },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('onerror="alert(1)');
  });

  it("blocks raw html-kind output (no sanitizer available)", () => {
    const html = render({
      kind: "html",
      settings: { html: "<script>alert(1)</script><p>hi</p>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<p>hi</p>");
  });

  it("blocks code-kind output", () => {
    const html = render({
      kind: "html",
      settings: { code: "<img src=x onerror=alert(1)>" },
    });
    expect(html).not.toContain("<img src=x onerror=");
  });

  it("coerces heading level (tag-name injection)", () => {
    const html = render({
      kind: "heading",
      settings: { text: "hi", level: '2 onclick="alert(1)' },
    });
    expect(html).not.toContain("onclick");
    expect(html).toContain("<h2>hi</h2>");
  });

  it("coerces spacer height (style-attribute breakout)", () => {
    const html = render({
      kind: "spacer",
      settings: { height: '24px" onmouseover="alert(1)' },
    });
    expect(html).not.toContain("onmouseover");
  });

  it("escapes plugin mount keys", () => {
    const html = render({
      kind: "plugin",
      pluginKey: 'x" onmouseover="alert(1)',
      settings: {},
    });
    expect(html).not.toContain('" onmouseover="');
  });

  it("renders benign plain-text content byte-identical (no double-escaping)", () => {
    const html = render({
      kind: "heading",
      settings: { text: "Fish & Chips — 50% off!", level: 2 },
    });
    expect(html).toContain("<h2>Fish &amp; Chips — 50% off!</h2>");
    const btn = render({
      kind: "button",
      settings: { label: "Shop now", href: "/store/abc/pages/sale" },
    });
    expect(btn).toContain(
      '<a class="btn" href="/store/abc/pages/sale">Shop now</a>',
    );
    const ext = render({
      kind: "button",
      settings: { label: "Blog", href: "https://example.com/a?b=1&c=2" },
    });
    expect(ext).toContain("https://example.com/a?b=1&amp;c=2");
  });
});
