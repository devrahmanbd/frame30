import { describe, expect, it } from "vitest";
import {
  buildCsp,
  compileCustomCode,
  newNonce,
  parseHeadSnippet,
  reviewJs,
  sandboxSrcDoc,
  sanitiseBodySnippet,
  scopeCss,
} from "./custom-code";
import { parseAst } from "./builder-ast";

describe("css scoping", () => {
  it("prefixes every selector with the theme scope", () => {
    const { css } = scopeCss(".hero { color: red } h2, .card { margin: 0 }");
    expect(css).toContain(".fq-theme-scope .hero");
    expect(css).toContain(".fq-theme-scope h2");
    expect(css).toContain(".fq-theme-scope .card");
  });

  it("cannot escape the scope via html/body or :root", () => {
    const { css } = scopeCss("body { background: black } :root { --x: 1px }");
    expect(css).not.toMatch(/(^|})\s*body\s*{/);
    expect(css.includes(".fq-theme-scope")).toBe(true);
  });

  it("keeps at-rule bodies scoped", () => {
    const { css } = scopeCss("@media (min-width: 40rem) { .a { color: red } }");
    expect(css).toContain("@media");
    expect(css).toContain(".fq-theme-scope .a");
  });

  it("flags a css payload over the limit", () => {
    const { findings } = scopeCss(`.a{color:red}`.repeat(20_000));
    expect(findings.some((f) => f.level === "error")).toBe(true);
  });
});

describe("javascript review", () => {
  it("rejects document.write and eval", () => {
    expect(reviewJs("document.write('x')").some((f) => f.level === "error")).toBe(true);
    expect(reviewJs("eval('1+1')").some((f) => f.level === "error")).toBe(true);
  });

  it("rejects embedded secrets", () => {
    // Assembled at runtime so the repo never contains a credential-shaped
    // literal: a real one and a fixture are indistinguishable to a scanner.
    const fixture = ["sk", "live", "51abcdefghijklmnopqrstuvwx"].join("_");
    const out = reviewJs(`const k = "${fixture}";`);
    expect(out.some((f) => f.level === "error")).toBe(true);
  });

  it("accepts an ordinary analytics snippet", () => {
    const out = reviewJs("window.addEventListener('load', () => console.log('hi'));");
    expect(out.filter((f) => f.level === "error")).toHaveLength(0);
  });
});

describe("head and body snippets", () => {
  it("keeps verification metas and drops http-equiv", () => {
    const out = parseHeadSnippet(
      '<meta name="google-site-verification" content="abc" /><meta http-equiv="refresh" content="0" />',
    );
    expect(out.tags).toHaveLength(1);
    expect(out.findings.some((f) => f.code === "head:http_equiv")).toBe(true);
  });

  it("allows ld+json but never a script src", () => {
    const ok = parseHeadSnippet('<script type="application/ld+json">{"@type":"Store"}</script>');
    expect(ok.tags).toHaveLength(1);
    const bad = parseHeadSnippet('<script src="https://evil.example/x.js"></script>');
    expect(bad.tags).toHaveLength(0);
  });

  it("strips scripts and event handlers from body snippets", () => {
    const out = sanitiseBodySnippet('<div onclick="steal()">hi</div><script>x()</script>', "body_start");
    expect(out.html).not.toContain("onclick");
    expect(out.html).not.toContain("<script");
    expect(out.html).toContain("hi");
  });

  it("rejects javascript: urls", () => {
    const out = sanitiseBodySnippet('<a href="javascript:alert(1)">x</a>', "body_end");
    expect(out.html).not.toContain("javascript:");
  });
});

describe("sandbox and csp", () => {
  it("builds a self-measuring sandbox document", () => {
    const doc = sandboxSrcDoc("<b>hi</b>");
    expect(doc).toContain("<b>hi</b>");
    expect(doc).toContain("fq:html-height");
  });

  it("issues a unique nonce and a strict policy", () => {
    const nonce = newNonce();
    expect(nonce).not.toEqual(newNonce());
    const csp = buildCsp(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors");
  });
});

describe("compile", () => {
  it("blocks on an error and passes clean code through", () => {
    const bad = compileCustomCode({ js: "eval('x')", enabled: true });
    expect(bad.blocked).toBe(true);
    const good = compileCustomCode({ css: ".a{color:red}", enabled: true });
    expect(good.blocked).toBe(false);
    expect(good.css).toContain(".fq-theme-scope .a");
  });

  it("returns nothing when the merchant disabled custom code", () => {
    const off = compileCustomCode({ css: ".a{color:red}", enabled: false });
    expect(off.css).toBe("");
  });
});

describe("html widget markup", () => {
  it("keeps markup but removes scripts and handlers", () => {
    const ast = parseAst({
      main: [{ id: "n1", type: "html", props: { markup: '<div onclick="x()">ok</div><script>bad()</script>' } }],
    });
    const markup = String(ast.main[0]?.props["markup"] ?? "");
    expect(markup).toContain("ok");
    expect(markup).not.toContain("onclick");
    expect(markup).not.toContain("<script");
  });
});
