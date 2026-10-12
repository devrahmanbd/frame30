/**
 * PKG frame30 — package stylesheet gate (pure, no dependencies).
 *
 * Package CSS (`styles/*.css`) ships inside a merchant-installable archive,
 * so it is untrusted input: it must never exfiltrate data, never pull remote
 * code, and never restyle host chrome outside the package surface.
 *
 * Contract with `src/lib/custom-code.ts` (`scopeCss`): that module is the
 * definition of "what merchant CSS may do". This gate derives its rules from
 * it —
 *   • at-rule allowlist = exactly what `scopeCss` keeps: `@media`,
 *     `@supports`, `@container`, `@layer` (recursed), `@keyframes`,
 *     `@font-face`. Everything else (`@page`, `@property`, …) is dropped.
 *     (`scopeCss` warns; the gate sanitizes — same outcome, no finding.)
 *   • property handling = the complement of `scopeCss`'s denylist: every
 *     property is allowed EXCEPT `--theme-*` redefinitions (tokens are
 *     read-only), the four exfil declarations below, and bare
 *     `position: fixed` (kept only on `.fq-allow-fixed`, same allowlist).
 *   • the four banned declarations are identical: `url(javascript:)`,
 *     `expression(`, `-moz-binding`, `behavior:` (all case-insensitive).
 *
 * Sanitize-vs-reject (the one decision this module makes):
 *   • SANITIZE (layout-safe, `ok` stays true, reflected in `sanitizedCss`):
 *     comments stripped, unknown at-rules dropped, `--theme-*` definitions
 *     dropped, bare `position: fixed` dropped, selectors prefixed with
 *     {@link PACKAGE_CSS_SCOPE} (`:root`/`html`/`body` map to the scope root
 *     so token lookups keep working — same as `scopeCss`). None of these can
 *     leak data; dropping them cannot break the host.
 *   • REJECT (`ok: false`, machine code in `errors`, no `sanitizedCss`):
 *     every exfiltration attempt — any `@import` (remote or local: a third-
 *     party request the merchant cannot be held to), `javascript:` urls,
 *     remote urls (`http:`/`https:`/protocol-relative/any other scheme),
 *     `data:` urls outside the font/image allowlist (in particular
 *     `data:text/html`), `expression(`, `-moz-binding`, `behavior:`.
 *     Hostile bytes are refused, never "cleaned", so callers must not guess
 *     what an exfiltration attempt "meant".
 *   • Detection runs on the browser tokenizer's view: CSS `\XX` escapes
 *     decoded, comments removed entirely (a comment-split `javascript:`
 *     IS `javascript:` on the wire). Ambiguous inputs are rejected, never
 *     "cleaned"; outputs keep the original text.
 *
 * Selector namespacing: every style-rule selector is prefixed with
 * {@link PACKAGE_CSS_SCOPE}. The serving lane must render package-styled DOM
 * inside an element carrying that class (mirroring the `CUSTOM_CSS_SCOPE`
 * contract); anything outside the scope element is unreachable by package
 * CSS. Keyframe steps (`from`/`to`/`%`) carry no selector and pass through.
 *
 * Zip wiring (`assertPackageContentAuthentic`) uses reject-only semantics:
 * on `ok` the file bytes are left untouched (checksums stay stable; scoping
 * happens at render via `scopeCss`), on `!ok` the package is refused with
 * `zip.css_rejected`. `sanitizedCss` is offered for future render lanes.
 */

export const PACKAGE_CSS_SCOPE = ".pkg-scope";

/** At-rules `scopeCss` understands; everything else is dropped (sanitized). */
const ALLOWED_AT_RULES = new Set([
  "media",
  "supports",
  "container",
  "layer",
  "keyframes",
  "font-face",
]);

/** Grouping at-rules whose bodies recurse as stylesheets. */
const NESTED_AT_RULES = new Set(["media", "supports", "container", "layer"]);

/** Same opt-in escape hatch `scopeCss` honours for fixed positioning. */
const FIXED_ALLOWLIST = /\.fq-allow-fixed\b/;

/** Theme tokens are read-only: usable, never redefinable. */
const TOKEN_VAR = /^--theme-/;

const BANNED_DECL: { re: RegExp; code: string }[] = [
  { re: /url\(\s*['"]?\s*javascript:/i, code: "css:js_url" },
  { re: /expression\s*\(/i, code: "css:expression" },
  { re: /-moz-binding\s*:/i, code: "css:binding" },
  { re: /behavior\s*:/i, code: "css:behavior" },
];

const URL_RE = /url\(\s*("([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

/**
 * `data:` urls are allowed only for fonts/images served inline: raster +
 * vector images and font containers. Anything else — especially
 * `data:text/html` and script payloads — is an exfiltration channel.
 */
const DATA_URL_ALLOW =
  /^data:(image\/[a-z0-9+.-]+|font\/[a-z0-9+.-]+|application\/(font-[a-z0-9+.-]+|x-font-[a-z0-9+.-]+|vnd\.ms-fontobject))/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Decode CSS escape sequences the way the browser tokenizer does — for
 * DETECTION ONLY (outputs keep the original text). `\6a avascript:` and
 * `javascript:` are the same identifier on the wire; the raw-source regexes
 * below must judge the decoded form or `\75 rl(` / `\64 ata:` smuggle past
 * every ban. Covers 1–6 hex digits + one consumed whitespace char, \<newline>
 * line continuations, and `\X` literal escapes (CSS Syntax §4.3.7).
 */
function decodeCssEscapes(s: string): string {
  return s.replace(
    /\\(\r\n|[0-9a-fA-F]{1,6}(?:\r\n|\s)?|[\s\S])/g,
    (_whole, g: string) => {
      if (/^[0-9a-fA-F]/.test(g)) {
        const hex = /^[0-9a-fA-F]{1,6}/.exec(g)?.[0] ?? "";
        const cp = parseInt(hex, 16);
        if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
          return "�";
        return String.fromCodePoint(cp);
      }
      // Backslash-newline is a continuation (removed); any other escaped
      // character stands for itself.
      if (/^(?:\r\n|[\r\n\f])$/.test(g)) return "";
      return g;
    },
  );
}

/** Comments vanish entirely during tokenization — never into whitespace. */
function stripCommentsFlat(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Detection view: what the browser sees. A comment-split `javascript:` and
 * a comment-split `@import` are contiguous post-tokenization, so hostile
 * scans run here; outputs keep the original text. Shared with `scopeCss`
 * (`custom-code.ts`) — the render-time lane must judge the same bytes.
 */
export function neutralizeForScan(s: string): string {
  return decodeCssEscapes(stripCommentsFlat(s));
}

function classifyUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.startsWith("#")) return null;
  if (/^javascript:/i.test(value)) return "css:js_url";
  if (/^data:/i.test(value)) {
    return DATA_URL_ALLOW.test(value) ? null : "css:unsafe_data_url";
  }
  if (value.startsWith("//") || SCHEME_RE.test(value)) return "css:remote_url";
  return null;
}

function urlErrorsIn(text: string, errors: string[]): void {
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text))) {
    const code = classifyUrl(m[2] ?? m[3] ?? m[4] ?? "");
    if (code && !errors.includes(code)) errors.push(code);
  }
}

function stripCssComments(css: string): string {
  // Removed entirely (never replaced with whitespace): that is what the
  // tokenizer does, and a space would split `java/**/script:` into a false
  // negative while the browser sees contiguous `javascript:`.
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return "";
  if (/^\d+%$/.test(trimmed) || trimmed === "from" || trimmed === "to") {
    return trimmed;
  }
  if (/^(:root|html|body)$/i.test(trimmed)) return scope;
  if (/^(:root|html|body)\b/i.test(trimmed)) {
    return `${scope}${trimmed.replace(/^(:root|html|body)/i, "")}`;
  }
  if (trimmed.startsWith(scope)) return trimmed;
  return `${scope} ${trimmed}`;
}

function scopeSelectorList(list: string, scope: string): string {
  return list
    .split(",")
    .map((part) => scopeSelector(part, scope))
    .filter(Boolean)
    .join(", ");
}

export type PackageCssGateResult = {
  ok: boolean;
  errors: string[];
  sanitizedCss?: string;
};

type Ctx = { scope: string; errors: string[]; out: string[] };

function pushUnique(errors: string[], code: string): void {
  if (!errors.includes(code)) errors.push(code);
}

/**
 * Split a rule body on `;` without breaking `url(...;...)` payloads: a naive
 * split truncates every `data:...;base64,...` URL mid-token, emitting corrupt
 * CSS (`background: url(data:image/png;`). Track `()` depth, quote state and
 * backslash escapes; split only on top-level, unquoted semicolons. Shared
 * with `scopeCss` for the same reason.
 */
export function splitDeclarations(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let k = 0; k < body.length; k += 1) {
    const ch = body[k]!;
    if (quote) {
      if (ch === "\\") k += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      out.push(body.slice(start, k));
      start = k + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/** Check one declaration; true = keep, false = drop (sanitized). */
function keepDeclaration(decl: string, selector: string, ctx: Ctx): boolean {
  const scan = neutralizeForScan(decl);
  for (const banned of BANNED_DECL) {
    if (banned.re.test(scan)) {
      pushUnique(ctx.errors, banned.code);
      return false;
    }
  }
  const before = ctx.errors.length;
  urlErrorsIn(scan, ctx.errors);
  if (ctx.errors.length !== before) return false;
  // Property/value identity is judged decoded: `p\6f sition` IS position to
  // the browser, and a `--the\6d e-*` definition redefines the token.
  const colon = scan.indexOf(":");
  const name = (colon < 0 ? scan : scan.slice(0, colon)).trim().toLowerCase();
  const value = colon < 0 ? "" : scan.slice(colon + 1).trim();
  if (TOKEN_VAR.test(name)) return false;
  if (
    name === "position" &&
    /fixed/i.test(value) &&
    !FIXED_ALLOWLIST.test(selector)
  ) {
    return false;
  }
  return true;
}

function emitRule(prelude: string, body: string, ctx: Ctx): void {
  const selector = scopeSelectorList(prelude, ctx.scope);
  if (!selector) return;
  // Exfiltration scan runs on the whole rule body BEFORE declaration
  // splitting: payloads like `data:...;base64,...` contain `;` and would
  // otherwise split into fragments no single `url(...)` match sees. The scan
  // runs on the neutralized (escape-decoded, comment-free) view — the same
  // bytes the browser tokenizer acts on.
  const before = ctx.errors.length;
  const scan = neutralizeForScan(body);
  for (const banned of BANNED_DECL) {
    if (banned.re.test(scan)) pushUnique(ctx.errors, banned.code);
  }
  urlErrorsIn(scan, ctx.errors);
  if (ctx.errors.length !== before) return;
  const kept: string[] = [];
  for (const raw of splitDeclarations(body)) {
    const decl = raw.trim();
    if (!decl) continue;
    if (!keepDeclaration(decl, selector, ctx)) continue;
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    kept.push(
      `${decl.slice(0, colon).trim().toLowerCase()}: ${decl.slice(colon + 1).trim()}`,
    );
  }
  if (kept.length) ctx.out.push(`${selector} { ${kept.join("; ")}; }`);
}

/** Raw-text check for leaf at-rule bodies (@font-face/@keyframes). */
function checkLeafBody(body: string, ctx: Ctx): boolean {
  const before = ctx.errors.length;
  const scan = neutralizeForScan(body);
  for (const banned of BANNED_DECL) {
    if (banned.re.test(scan)) pushUnique(ctx.errors, banned.code);
  }
  urlErrorsIn(scan, ctx.errors);
  return ctx.errors.length === before;
}

function readBlock(css: string, from: number): { body: string; end: number } {
  let depth = 0;
  for (let j = from; j < css.length; j += 1) {
    if (css[j] === "{") depth += 1;
    else if (css[j] === "}") {
      depth -= 1;
      if (depth === 0) return { body: css.slice(from + 1, j), end: j + 1 };
    }
  }
  return { body: css.slice(from + 1), end: css.length };
}

function run(css: string, ctx: Ctx): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const { body, end } = readBlock(css, open);
    i = end;
    if (!prelude) continue;
    if (prelude.startsWith("@")) {
      // At-rule identity is judged neutralized: `@\6d edia` IS @media to the
      // browser, so it recurses as media (and its body is scanned); an
      // escaped `@\69mport` is already rejected by the upfront @import check.
      const name =
        neutralizeForScan(prelude)
          .match(/^@([a-z-]+)/i)?.[1]
          ?.toLowerCase() ?? "";
      if (!ALLOWED_AT_RULES.has(name)) {
        // Dropped from output, but the body is still scanned: the browser
        // honors some dropped wrappers (@page applies in print context), so
        // a hostile body inside one is a reject, never a silent drop.
        checkLeafBody(body, ctx);
        continue;
      }
      if (NESTED_AT_RULES.has(name)) {
        const inner: Ctx = { scope: ctx.scope, errors: ctx.errors, out: [] };
        run(body, inner);
        if (inner.out.length)
          ctx.out.push(
            `${neutralizeForScan(prelude)} {\n${inner.out.join("\n")}\n}`,
          );
        continue;
      }
      if (checkLeafBody(body, ctx)) ctx.out.push(`${prelude} {${body}}`);
      continue;
    }
    emitRule(prelude, body, ctx);
  }
}

export function gatePackageCss(
  input: string,
  scope: string = PACKAGE_CSS_SCOPE,
): PackageCssGateResult {
  const errors: string[] = [];
  if (!input.trim()) return { ok: true, errors, sanitizedCss: "" };
  // Any @import — remote or local — is a third-party request / exfiltration
  // channel (`scopeCss` rejects it the same way); the sheet is refused. The
  // check runs neutralized so an escaped `@import` and a comment-split one
  // (contiguous post-tokenization) cannot smuggle past the raw-source pattern.
  if (/@import\b/i.test(neutralizeForScan(input))) {
    pushUnique(errors, "css:import");
    return { ok: false, errors };
  }
  const ctx: Ctx = { scope, errors, out: [] };
  run(stripCssComments(input), ctx);
  if (ctx.errors.length) return { ok: false, errors: ctx.errors };
  return { ok: true, errors: [], sanitizedCss: ctx.out.join("\n") };
}
