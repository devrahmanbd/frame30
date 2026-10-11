/**
 * plugin-js-scan — AST deep check for widget bundle entries.
 *
 * Red step (TDD): the scanner module does not exist yet. These tests pin the
 * contract before the implementation lands:
 * - adversarial entries the gate regexes miss MUST be rejected
 *   (obfuscation, aliases, encoded payloads, static imports,
 *   member-expression constructors);
 * - benign entries MUST keep passing with zero false positives — every
 *   builtin widget entry in `builtin-plugins.ts` (notably the WhatsApp chat
 *   bubble with its static-literal `innerHTML` assignment), `export default`
 *   forms, and string literals that merely mention "eval".
 */
import { describe, expect, it } from "vitest";
import { BUILTIN_PLUGINS } from "./builtin-plugins";
import { parseManifest } from "./plugin-manifest";
import { validateBundle } from "./marketplace-scopes";

const { scanJsAst, scanJsEntry } = await import("./plugin-js-scan");

const MANIFEST_BASE = {
  id: "ast-probe",
  name: "AST probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront", "read_shop"],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
} as const;

const withEntry = (entry: string) => ({
  ...MANIFEST_BASE,
  widgets: [{ key: "w1", label: "W", slots: ["main"], entry }],
});

function expectRejected(entry: string) {
  const r = scanJsEntry(entry);
  expect(r.ok, `expected rejection: ${entry.slice(0, 80)}`).toBe(false);
  expect(r.findings.length).toBeGreaterThan(0);
  for (const f of r.findings) {
    expect(typeof f.rule).toBe("string");
    expect(f.rule.length).toBeGreaterThan(0);
    expect(typeof f.excerpt).toBe("string");
    expect(f.excerpt.length).toBeGreaterThan(0);
  }
  return r;
}

function expectClean(entry: string) {
  const r = scanJsEntry(entry);
  expect(r.ok, `expected clean: ${entry.slice(0, 120)}`).toBe(true);
  expect(r.findings).toEqual([]);
  return r;
}

describe("plugin-js-scan adversarial cases", () => {
  it("rejects comment-obfuscated calls the regexes miss", () => {
    expectRejected("eval/*c*/('x')");
    expectRejected("new/**/Function('return 1')");
    expectRejected("import/**/( 'evil' )");
    expectRejected("window.eval/**//*x*/('y')");
  });

  it("rejects unicode-escaped identifiers", () => {
    expectRejected("\\u0065val('x')");
    expectRejected("\\u0046unction('x')");
  });

  it("rejects global aliases called later", () => {
    expectRejected("const e = eval; e('x')");
    expectRejected("let F = Function; new F('return 1')");
    expectRejected('var st = setTimeout; st("alert(1)", 10)');
    expectRejected("const si = window.setInterval; si('tick()', 1000)");
    expectRejected("let g = globalThis.Function; g('x')");
    expectRejected("const { eval: e2 } = window; e2('x')");
  });

  it("stops flagging an alias shadowed by reassignment to safe code", () => {
    expectClean("let e = eval; e = console.log; e('x')");
  });

  it("rejects encoded-payload combos", () => {
    expectRejected("eval(atob('YWxlcnQoMSk='))");
    expectRejected("const c = atob('eA=='); eval(c)");
    expectRejected("const c = atob('eA=='); setTimeout(c, 10)");
    expectRejected("eval(String.fromCharCode(97,108,101,114,116))");
    expectRejected("setTimeout(decodeURIComponent('%61%62'), 1)");
  });

  it("rejects static imports and re-exports", () => {
    expectRejected("import x from 'evil'");
    expectRejected("import 'evil'");
    expectRejected("import * as ns from 'evil'");
    expectRejected("export { x } from 'evil'");
    expectRejected('export * from "evil"');
  });

  it("rejects member-expression / Reflect constructors", () => {
    expectRejected("Reflect.construct(Function, ['return 1'])");
    expectRejected("Reflect.apply(Function, null, ['x'])");
    expectRejected("({}).constructor.constructor('alert(1)')");
    expectRejected("x.constructor.constructor('code')");
    expectRejected("a['constructor']['constructor']('x')");
    expectRejected("new (x.constructor)('y')");
    expectRejected("new (0, Function)('x')");
    expectRejected("(0, eval)('x')");
    expectRejected("(x.constructor)('y')");
    expectRejected("window.Function('x')");
    expectRejected("globalThis.eval('x')");
    expectRejected("self['Function']('x')");
    expectRejected("const R = Reflect; R.construct(Function, [])");
  });

  it("rejects nested calls the linear walk must descend into", () => {
    expectRejected("foo(eval('x'))");
    expectRejected("const x = eval('y')");
    expectRejected("void (0, eval)('x')");
    expectRejected("const t = `v:${eval(x)}`;");
    expectRejected("setTimeout('a', eval('b'))");
  });

  it("rejects DOM sinks and string timers", () => {
    expectRejected("el.innerHTML = userInput");
    expectRejected("el.innerHTML = '<div>' + name");
    expectRejected("el.outerHTML = data");
    expectRejected("document.write('<p>hi</p>')");
    expectRejected("document['write'](x)");
    expectRejected('setTimeout("alert(1)", 100)');
    expectRejected("setInterval('tick()', 1000)");
    expectRejected("setTimeout(`alert(${x})`, 1)");
    expectRejected("window.setTimeout('go()', 5)");
  });

  it("scanJsAst agrees with scanJsEntry on AST-detectable cases", () => {
    for (const entry of [
      "const e = eval; e('x')",
      "x.constructor.constructor('code')",
      "el.innerHTML = userInput",
      "document.write('x')",
    ]) {
      expect(scanJsAst(entry).ok, entry).toBe(false);
      expect(scanJsAst(entry).findings.length).toBeGreaterThan(0);
    }
  });
});

describe("plugin-js-scan benign pins (zero false positives)", () => {
  it("passes every builtin widget entry", () => {
    let count = 0;
    for (const plugin of BUILTIN_PLUGINS) {
      for (const widget of plugin.manifest.widgets) {
        const r = scanJsEntry(widget.entry);
        expect(
          r.ok,
          `${plugin.manifest.id}/${widget.key}: ${JSON.stringify(r.findings)}`,
        ).toBe(true);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it("every builtin manifest still passes parseManifest", () => {
    for (const plugin of BUILTIN_PLUGINS) {
      const v = parseManifest(plugin.manifest);
      expect(v.ok, plugin.manifest.id).toBe(true);
    }
  });

  it("passes export-default forms without a from-specifier", () => {
    expectClean("export default 1");
    expectClean("export default function Widget() { return null; }");
    expectClean("export const x = 1");
  });

  it("ignores eval-like text inside strings and comments", () => {
    expectClean(
      "const s = \"eval('x') and new Function('y')\"; framique.mount(document.createTextNode(s))",
    );
    expectClean("// eval('x')\nframique.mount()");
    expectClean("/* import x from 'evil' */\nframique.mount()");
    // Regex literals are data, not code — even statement-position ones.
    expectClean("if (/eval\\(/.test(s)) { framique.mount(); }");
    expectClean("if (s) /eval\\(/.test(s); framique.mount()");
  });

  it("passes function-argument timers and safe DOM writes", () => {
    expectClean("setTimeout(() => update(), 100)");
    expectClean("setTimeout(function () {}, 50)");
    expectClean("setInterval(tick, 1000)");
    expectClean("el.textContent = name");
    expectClean("el.setAttribute('href', url)");
    expectClean("a.innerHTML = '<svg viewBox=\"0 0 1 1\"></svg>'");
  });

  it("passes single constructor reads and benign globals", () => {
    expectClean("const n = x.constructor.name");
    expectClean("if (x.constructor === Foo) { init(); }");
    expectClean(
      "var ok = window.matchMedia('(max-width: 768px)').matches; framique.mount(document.createElement('div'))",
    );
    expectClean(
      'framique.call("plugin.settings", {}).then(function (s) { mount(s || {}); }, function () {})',
    );
  });
});

describe("AST second stage wired into both gates", () => {
  it("parseManifest rejects regex-invisible dynamic code with dynamic_code", () => {
    for (const entry of [
      "const e = eval; e('x')",
      "Reflect.construct(Function, ['return 1'])",
      "x.constructor.constructor('code')",
      "el.innerHTML = userInput",
      "document.write('x')",
      "eval/*c*/('x')",
    ]) {
      const v = parseManifest(withEntry(entry));
      expect(v.ok, entry).toBe(false);
      if (!v.ok) expect(v.errors.join(" ")).toContain("dynamic_code");
    }
  });

  it("validateBundle rejects regex-invisible dynamic code with bundle.dynamic_code", () => {
    for (const entry of [
      "const e = eval; e('x')",
      "Reflect.construct(Function, ['return 1'])",
      "x.constructor.constructor('code')",
      "eval/*c*/('x')",
      "setTimeout(/*c*/'go()', 5)",
    ]) {
      const v = validateBundle({ entry }, ["read_shop"]);
      expect(v.ok, entry).toBe(false);
      expect(v.errors).toContain("bundle.dynamic_code");
    }
  });

  it("both gates still accept the benign pins", () => {
    // NOTE: the static-literal innerHTML line passes parseManifest (whose
    // regex never covered innerHTML, and the AST allows pure-literal markup)
    // but validateBundle's regex still rejects ANY `.innerHTML =` — that
    // pre-existing bundle-domain strictness is preserved, not duplicated.
    // Likewise both gates' legacy regexes still fire on eval-like text
    // inside string literals (pinned below); only the new AST stage is
    // string-aware.
    for (const entry of [
      "framique.mount(document.createElement('div'))",
      "export default 1",
      "export default function Widget() { return null; }",
      "setTimeout(() => update(), 100)",
      "a.innerHTML = '<svg viewBox=\"0 0 1 1\"></svg>'",
    ]) {
      expect(parseManifest(withEntry(entry)).ok, `manifest:${entry}`).toBe(
        true,
      );
    }
    for (const entry of [
      "framique.mount(document.createElement('div'))",
      "export default 1",
      "export default function Widget() { return null; }",
      "setTimeout(() => update(), 100)",
    ]) {
      expect(
        validateBundle({ entry }, ["read_shop"]).ok,
        `bundle:${entry}`,
      ).toBe(true);
    }
  });

  it("gates preserve legacy regex strictness on non-code text", () => {
    // Unchanged pre-existing behavior: the gate regexes test the raw
    // source, so eval-like prose inside a string still fails closed.
    // The new AST stage alone (scanJsAst/scanJsEntry) is string-aware.
    for (const entry of [
      "const s = \"eval('x')\"; framique.mount(document.createTextNode(s))",
      "// eval('x')\nframique.mount()",
    ]) {
      expect(parseManifest(withEntry(entry)).ok, `manifest:${entry}`).toBe(
        false,
      );
      const v = validateBundle({ entry }, ["read_shop"]);
      expect(v.ok, `bundle:${entry}`).toBe(false);
      expect(v.errors).toContain("bundle.dynamic_code");
    }
  });

  it("entry ≤200KB guard stays covered by validateBundle (no duplicate guard)", () => {
    expect(
      validateBundle({ entry: "x".repeat(200_001) }, ["read_shop"]).errors,
    ).toContain("bundle.entry_too_large");
    expect(
      validateBundle({ entry: "x".repeat(200_000) }, ["read_shop"]).errors,
    ).not.toContain("bundle.entry_too_large");
  });
});
