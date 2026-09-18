/** Adversarial regression: classic XSS payloads must not survive the allowlist. */
import { describe, expect, it } from "vitest";
import { sanitiseBodySnippet, parseHeadSnippet } from "./custom-code";

const PAYLOADS: [string, string][] = [
  ["img-onerror", `<img src=x onerror="alert(1)">`],
  ["svg-onload", `<svg onload="alert(1)">`],
  ["script-tag", `<script>alert(1)</script>`],
  ["js-url", `<a href="javascript:alert(1)">x</a>`],
  ["event-handler", `<div onmouseover="alert(1)">x</div>`],
  ["iframe-srcdoc", `<iframe srcdoc="<script>alert(1)</script>"></iframe>`],
  ["form-action-js", `<form action="javascript:alert(1)"><button>x</button></form>`],
  ["style-expression", `<div style="x:expression(alert(1))">x</div>`],
  ["head-script", `<script src="https://evil.example/x.js"></script>`],
];

describe("xss probe", () => {
  for (const [name, p] of PAYLOADS) {
    it(`neutralises body payload: ${name}`, () => {
      const { html } = sanitiseBodySnippet(p, "body_end");
      expect(html).not.toMatch(/onerror|onload|onmouseover/i);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/javascript:/i);
    });
  }
  it("rejects head script tags", () => {
    const r = parseHeadSnippet(`<script src="https://evil.example/x.js"></script>`);
    expect(r.tags).toHaveLength(0);
    expect(r.findings.length).toBeGreaterThan(0);
  });
});
