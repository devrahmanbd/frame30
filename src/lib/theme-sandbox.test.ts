import { describe, expect, it } from "vitest";
import {
  AST_LIMITS,
  assertPayloadWithinLimits,
  lintTemplate,
  parseAst,
  parseTemplates,
  safeEmbedUrl,
  sanitiseText,
  takeSanitiserRejects,
} from "./builder-ast";

const html = (body: string) => ({
  main: [{ id: "s1", type: "html", props: { body } }],
});

describe("theme sandbox — content sanitiser", () => {
  it("strips tags, event handlers and residual angle brackets", () => {
    const payloads = [
      `<script>alert(1)</script>`,
      `<img src=x onerror="alert(1)">`,
      `<div onclick="steal()">hi</div>`,
      `<iframe src="https://evil.test"></iframe>`,
      `<svg/onload=alert(1)`,
    ];
    for (const payload of payloads) {
      const out = sanitiseText(payload, 2000);
      expect(out).not.toMatch(/[<>]/);
      expect(out.toLowerCase()).not.toContain("script>");
      expect(out.toLowerCase()).not.toContain("onerror=");
    }
  });

  it("keeps the html widget as plain text through the parser", () => {
    const ast = parseAst(html(`<script>alert(1)</script>safe copy`));
    expect(String(ast.main[0]?.props["body"])).toBe("safe copy");
  });

  it("counts rejections so the sanitiser is observable", () => {
    takeSanitiserRejects();
    parseAst(html("<b>bold</b>"));
    expect(takeSanitiserRejects()).toBeGreaterThan(0);
  });
});

describe("theme sandbox — links and embeds", () => {
  const link = (href: string) =>
    parseAst({ main: [{ id: "s1", type: "hero", props: { ctaHref: href } }] })
      .main[0]?.props["ctaHref"];

  it("rejects dangerous link schemes", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "vbscript:x",
      "//evil.test",
    ]) {
      expect(link(href)).toBe("");
    }
  });

  it("allows safe link schemes", () => {
    for (const href of [
      "https://a.test/x",
      "/collections",
      "#top",
      "mailto:a@b.test",
      "tel:+8801",
    ]) {
      expect(link(href)).toBe(href);
    }
  });

  it("frames only allowlisted https hosts", () => {
    expect(safeEmbedUrl("https://www.youtube.com/embed/abc")).toContain(
      "youtube.com/embed/abc",
    );
    expect(safeEmbedUrl("https://player.vimeo.com/video/1")).toContain(
      "player.vimeo.com",
    );
    for (const bad of [
      "https://evil.test/frame",
      "http://www.youtube.com/embed/abc",
      "javascript:alert(1)",
      "https://www.youtube.com.evil.test/embed/abc",
    ]) {
      expect(safeEmbedUrl(bad)).toBe("");
    }
  });
});

describe("theme sandbox — structural limits", () => {
  it("rejects an oversized payload", () => {
    const big = {
      templates: {
        index: {
          main: [
            {
              id: "s",
              type: "html",
              props: { body: "x".repeat(AST_LIMITS.maxPayloadChars) },
            },
          ],
        },
      },
    };
    expect(() => assertPayloadWithinLimits(big)).toThrow(/payload_too_large/);
  });

  it("rejects a deeply nested payload", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < AST_LIMITS.maxDepth + 4; i += 1) deep = { child: deep };
    expect(() => assertPayloadWithinLimits(deep)).toThrow(/payload_too_deep/);
  });

  it("caps sections per slot", () => {
    const many = Array.from(
      { length: AST_LIMITS.maxSectionsPerSlot + 25 },
      (_, i) => ({
        id: `s${i}`,
        type: "html",
        props: { body: "x" },
      }),
    );
    expect(parseAst({ main: many }).main.length).toBe(
      AST_LIMITS.maxSectionsPerSlot,
    );
  });

  it("drops malformed template keys and unknown widgets", () => {
    const parsed = parseTemplates({
      index: { main: [{ id: "s1", type: "html", props: {} }] },
      "../../etc/passwd": { main: [{ id: "x", type: "html", props: {} }] },
      __proto__: { main: [] },
    });
    expect(Object.keys(parsed)).toEqual(["index"]);
    const unknown = parseAst({
      main: [{ id: "s1", type: "evil_widget", props: {} }],
    });
    expect(unknown.main[0]?.invalid).toContain("unknown_widget");
  });
});

describe("theme lint — advCss and html widget XSS (Phase 1B)", () => {
  // End-to-end: content goes through the parse-time sanitiser first, then
  // the lint — so these prove the vectors that SURVIVE parsing are caught.
  // (Scripts/handlers are stripped at parse; that stripping is pinned by
  // the "keeps markup but removes scripts and handlers" case in
  // phase4-custom-code.test.ts.)
  const lintErrors = (ast: ReturnType<typeof parseAst>) =>
    lintTemplate(ast).filter(
      (i) => i.level === "error" && /Custom (HTML|CSS)/.test(i.message),
    );

  it("flags a javascript: href in html markup after parsing", () => {
    const ast = parseAst({
      main: [
        {
          id: "s1",
          type: "html",
          props: { markup: '<a href="javascript:alert(1)">x</a>' },
        },
      ],
    });
    // The sanitiser keeps markup structurally: the URL survives parsing.
    expect(String(ast.main[0]?.props["markup"])).toContain("javascript:");
    const errors = lintErrors(ast);
    expect(errors.some((i) => /javascript/.test(i.message))).toBe(true);
  });

  it("flags an insecure iframe source in html markup after parsing", () => {
    const ast = parseAst({
      main: [
        {
          id: "s1",
          type: "html",
          props: { markup: '<iframe src="http://evil.test/x"></iframe>' },
        },
      ],
    });
    const errors = lintErrors(ast);
    expect(errors.some((i) => /https/.test(i.message))).toBe(true);
  });

  it("flags CSS expression() in advCss after parsing", () => {
    const ast = parseAst({
      main: [
        {
          id: "s1",
          type: "hero",
          props: { advCss: "selector{width:expression(alert(1))}" },
        },
      ],
    });
    const errors = lintErrors(ast);
    expect(errors.some((i) => /expression/.test(i.message))).toBe(true);
  });

  it("flags @import and javascript: url() in advCss after parsing", () => {
    const ast = parseAst({
      main: [
        {
          id: "s1",
          type: "hero",
          props: {
            advCss: '@import url("https://evil.test/x.css");selector{}',
          },
        },
        {
          id: "s2",
          type: "hero",
          props: { advCss: "selector{background:url(javascript:alert(1))}" },
        },
      ],
    });
    const errors = lintErrors(ast);
    expect(errors.some((i) => /@import/.test(i.message))).toBe(true);
    expect(errors.some((i) => /javascript/.test(i.message))).toBe(true);
  });

  it("flags scripts and handlers on ASTs that bypassed the parser", () => {
    // Defense-in-depth: parse strips these, so a raw AST literal stands in
    // for registry seeds and constructed previews that never saw the parser.
    const raw = {
      header: [],
      main: [
        {
          id: "s1",
          type: "html",
          props: { markup: '<div onclick="steal()">ok</div>' },
        },
        {
          id: "s2",
          type: "html",
          props: { markup: "<script>bad()</script>" },
        },
      ],
      footer: [],
    } as never;
    const errors = lintTemplate(raw).filter(
      (i) => i.level === "error" && /Custom HTML/.test(i.message),
    );
    expect(errors.some((i) => /event handler/.test(i.message))).toBe(true);
    expect(errors.some((i) => /<script>/.test(i.message))).toBe(true);
  });

  it("stays clean on benign markup and benign advCss", () => {
    const ast = parseAst({
      main: [
        {
          id: "s1",
          type: "html",
          props: {
            markup:
              '<p>Visit <a href="https://example.test/x">our store</a></p>',
          },
        },
        {
          id: "s2",
          type: "hero",
          props: { advCss: "selector{color:red;margin-top:8px}" },
        },
      ],
    });
    expect(lintErrors(ast)).toEqual([]);
  });
});
