/**
 * T1 stored-XSS exploit proofs for renderBuilderHtml (shopper render path:
 * ArticleBody:195 calls it directly; PageView:86 and StoreHomepage:72 render
 * the server-supplied `html`, which is renderBuilderHtml output for builder
 * docs via getStorePageFn. Dashboard preview (pages.tsx:527) does NOT share
 * this path — builder mode renders <PageCanvas/> (React), markdown mode
 * renders renderPageMarkdown.
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

  it("blocks legacy code field on html-kind widgets", () => {
    const html = render({
      kind: "html",
      settings: { code: "<img src=x onerror=alert(1)>" },
    });
    expect(html).not.toContain("<img src=x onerror=");
  });

  it("drops kind:code widgets as an inert default comment (fail-closed)", () => {
    // Reconciliation note: only kind:"html" emits <!-- widget:html:blocked -->;
    // kind:"code" falls through to the default branch, which is equally inert
    // (payload never rendered) under its own marker. Both are fail-closed.
    const html = render({
      kind: "code",
      settings: { code: "<img src=x onerror=alert(1)>" },
    });
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<!-- widget:code -->");
  });

  it("drops kind:code html field as an inert default comment", () => {
    const html = render({
      kind: "code",
      settings: { html: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("<!-- widget:code -->");
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

  it("gates obfuscated data:/vbscript: img src", () => {
    for (const src of [
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "  \n dAtA :text/html;base64,xxx",
      "vbscript:msgbox(1)",
      "vb\tbscript:msgbox(1)",
    ]) {
      const html = render({ kind: "image", settings: { src, alt: "x" } });
      expect(html).not.toContain("msgbox");
      expect(html).toContain('src=""');
    }
    expect(
      render({
        kind: "image",
        settings: { src: "data:text/html;base64,xxx" },
      }),
    ).not.toContain("data:text");
  });

  it("gates data:/vbscript: button hrefs", () => {
    for (const href of [
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "  DaTa:text/html,hi",
    ]) {
      const html = render({
        kind: "button",
        settings: { label: "x", href },
      });
      expect(html).toContain('href="#"');
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("msgbox");
    }
  });

  it("gates product card href/src and escapes title/currency", () => {
    const widget = {
      kind: "products",
      id: "w1",
      type: "products",
      settings: {},
    };
    const products = {
      w1: [
        {
          id: "p1",
          title: 't"><script>alert(1)</script>',
          slug: "s",
          imageUrl: "javascript:alert(1)",
          priceMinor: 100,
          currency: 'USD" onmouseover="alert(1)',
          href: "javascript:alert(1)",
        },
      ],
    };
    const html = renderBuilderHtml(docWith(widget) as never, products as never);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain('href="#"');
    expect(html).toContain('src=""');
  });

  it("gates obfuscated product href/src", () => {
    const widget = {
      kind: "products",
      id: "w1",
      type: "products",
      settings: {},
    };
    const products = {
      w1: [
        {
          id: "p1",
          title: "t",
          slug: "s",
          imageUrl: "  JaVaScRiPt:alert(1)",
          priceMinor: null,
          currency: "USD",
          href: "  vbscript:msgbox(1)",
        },
      ],
    };
    const html = renderBuilderHtml(docWith(widget) as never, products as never);
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).not.toContain("msgbox");
    expect(html).toContain('href="#"');
    expect(html).toContain('src=""');
  });

  it("escapes section ids (attribute breakout)", () => {
    const html = renderBuilderHtml({
      sections: [
        {
          id: 's1" onmouseover="alert(1)',
          columns: [
            {
              id: "c1",
              width: 1,
              widgets: [{ kind: "text", settings: { text: "hi" } }],
            },
          ],
        },
      ],
    } as never);
    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain("s1&quot;");
  });

  it("coerces column width (style-attribute breakout)", () => {
    for (const width of [
      "2; color:red; x:",
      "1}...</div><script>alert(1)</script>",
      Infinity,
    ]) {
      const html = renderBuilderHtml({
        sections: [
          {
            id: "s1",
            columns: [
              {
                id: "c1",
                width,
                span: 6,
                widgets: [{ kind: "text", settings: { text: "hi" } }],
              },
            ],
          },
        ],
      } as never);
      expect(html).not.toContain("color:red");
      expect(html).not.toContain("<script>");
      expect(html).toContain("flex:0.5");
    }
  });

  it("keeps unknown-kind comment breakout inert", () => {
    const html = render({ kind: "--><script>alert(1)</script><!--" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("--&gt;");
  });

  it("escapes apostrophes without breaking attributes", () => {
    const html = render({
      kind: "heading",
      settings: { text: "it's fine", level: 2 },
    });
    expect(html).toContain("it&#39;s fine");
    const plugin = render({
      kind: "plugin",
      pluginKey: "k",
      settings: { note: "it's <b>x</b>" },
    });
    expect(plugin).not.toContain("it's <b>");
    expect(plugin).toContain("it&#39;s \\u003cb>");
    expect(plugin).toContain("data-plugin-settings='");
  });
});
