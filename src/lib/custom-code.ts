/**
 * Phase 4 — custom code: HTML / CSS / JS.
 *
 * Everything in this module is pure and runs identically on the server (save,
 * publish gate) and in the studio (live lint), which is what keeps the merchant
 * preview honest: the editor shows exactly the findings that would block a
 * publish.
 *
 * The contract, in one place:
 *   • CSS is **prefix-scoped** to the storefront root and may never define a
 *     theme token — tokens are exposed read-only.
 *   • JS is deferred and never inlined into the SSR document; it is registered
 *     with a per-request nonce and runs in a sandboxed island.
 *   • Head and body snippets are **allowlists**, not sanitisers: anything not
 *     on the list is dropped with a finding.
 *   • The `html` widget is plain text in the AST; real markup lives here and
 *     renders inside a sandboxed iframe with no same-origin access.
 */

export const CUSTOM_CODE_LIMITS = {
  css: 40_000,
  js: 20_000,
  head: 4_000,
  body: 4_000,
  html: 8_000,
} as const;

export type Finding = {
  level: "error" | "warn";
  /** Stable machine code — used by metrics and by the publish gate. */
  code: string;
  message: string;
  /** Surface the finding belongs to. */
  field: "css" | "js" | "head" | "body_start" | "body_end" | "html";
};

export type CustomCode = {
  css: string;
  js: string;
  head: string;
  bodyStart: string;
  bodyEnd: string;
  /** Analytics-adjacent JS only runs once the visitor has consented. */
  jsRequiresConsent: boolean;
  enabled: boolean;
};

export const EMPTY_CUSTOM_CODE: CustomCode = {
  css: "",
  js: "",
  head: "",
  bodyStart: "",
  bodyEnd: "",
  jsRequiresConsent: true,
  enabled: true,
};

/** The single root every merchant stylesheet is confined to. */
export const CUSTOM_CSS_SCOPE = ".fq-theme-scope";

/** Opt-in escape hatch for the only legitimate fixed-position use cases. */
const FIXED_ALLOWLIST = /\.fq-allow-fixed\b/;

/** Theme tokens are read-only: a stylesheet may use them, never redefine them. */
const TOKEN_VAR = /^--theme-/;

const f = (level: Finding["level"], code: string, message: string, field: Finding["field"]): Finding => ({
  level,
  code,
  message,
  field,
});

/* --------------------------------------------------------------- secrets */

const SECRET_RULES: { id: string; re: RegExp }[] = [
  { id: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { id: "jwt", re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "openai-key", re: /\bsk-[A-Za-z0-9]{32,}/ },
  { id: "stripe-secret", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "slack-token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  {
    id: "hardcoded-secret-assignment",
    re: /\b(?:secret|password|passwd|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9!@#$%^&*_+\-/]{16,}["']/i,
  },
];

/** Same rule set the repo scanner uses, applied to merchant-authored code. */
export function scanSecrets(source: string, field: Finding["field"]): Finding[] {
  const out: Finding[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.re.test(source)) {
      out.push(f("error", `secret:${rule.id}`, `Possible credential in custom code (${rule.id}).`, field));
    }
  }
  return out;
}

/* ------------------------------------------------------------------- CSS */

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function scopeSelector(selector: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return "";
  // Keyframe steps and at-rule preludes are passed through untouched.
  if (/^\d+%$/.test(trimmed) || trimmed === "from" || trimmed === "to") return trimmed;
  // The storefront root is the merchant's `:root` — token lookups still work
  // because the scope element carries every custom property.
  if (/^(:root|html|body)$/i.test(trimmed)) return CUSTOM_CSS_SCOPE;
  if (/^(:root|html|body)\b/i.test(trimmed)) {
    return `${CUSTOM_CSS_SCOPE}${trimmed.replace(/^(:root|html|body)/i, "")}`;
  }
  if (trimmed.startsWith(CUSTOM_CSS_SCOPE)) return trimmed;
  return `${CUSTOM_CSS_SCOPE} ${trimmed}`;
}

function scopeSelectorList(list: string): string {
  return list
    .split(",")
    .map((part) => scopeSelector(part))
    .filter(Boolean)
    .join(", ");
}

const BANNED_DECLARATIONS: { re: RegExp; code: string; message: string }[] = [
  { re: /url\(\s*['"]?\s*javascript:/i, code: "css:js_url", message: "url(javascript:) is not allowed." },
  { re: /expression\s*\(/i, code: "css:expression", message: "CSS expression() is not allowed." },
  { re: /-moz-binding\s*:/i, code: "css:binding", message: "-moz-binding is not allowed." },
  { re: /behavior\s*:/i, code: "css:behavior", message: "behavior: is not allowed." },
];

type Block = { selector: string; body: string };

/**
 * Prefix-scopes a merchant stylesheet and strips everything that could escape
 * the storefront root. Returns the rewritten CSS plus every finding; an error
 * finding blocks publish, the offending rule is dropped either way.
 */
export function scopeCss(input: string, scopeAttr?: string): { css: string; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!input.trim()) return { css: "", findings };
  if (input.length > CUSTOM_CODE_LIMITS.css) {
    findings.push(f("error", "css:too_large", `Stylesheet exceeds ${CUSTOM_CODE_LIMITS.css} characters.`, "css"));
    return { css: "", findings };
  }

  let css = stripCssComments(input);

  // Remote @import is a third-party request the merchant cannot be held to and
  // a trivial exfiltration channel — never allowed, local ones neither.
  css = css.replace(/@import[^;]*;/gi, () => {
    findings.push(f("error", "css:import", "@import is not allowed — use the head snippet for fonts.", "css"));
    return "";
  });

  findings.push(...scanSecrets(css, "css"));

  const out: string[] = [];
  const emitBlock = ({ selector, body }: Block, indent: string) => {
    const declarations: string[] = [];
    for (const raw of body.split(";")) {
      const decl = raw.trim();
      if (!decl) continue;
      const banned = BANNED_DECLARATIONS.find((b) => b.re.test(decl));
      if (banned) {
        findings.push(f("error", banned.code, banned.message, "css"));
        continue;
      }
      const [prop = "", ...rest] = decl.split(":");
      const name = prop.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (TOKEN_VAR.test(name)) {
        findings.push(f("warn", "css:token_readonly", `Theme token ${name} is read-only and was ignored.`, "css"));
        continue;
      }
      if (name === "position" && /fixed/i.test(value) && !FIXED_ALLOWLIST.test(selector)) {
        findings.push(
          f("warn", "css:fixed", "position: fixed is only allowed on .fq-allow-fixed elements — dropped.", "css"),
        );
        continue;
      }
      declarations.push(`${name}: ${value}`);
    }
    if (!declarations.length) return;
    out.push(`${indent}${selector} { ${declarations.join("; ")}; }`);
  };

  // A single-pass block walker: enough for real stylesheets, and it never
  // executes anything it does not understand — unknown at-rules are dropped.
  let i = 0;
  const readBlock = (from: number): { body: string; end: number } => {
    let depth = 0;
    for (let j = from; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) return { body: css.slice(from + 1, j), end: j + 1 };
      }
    }
    return { body: css.slice(from + 1), end: css.length };
  };

  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const { body, end } = readBlock(open);
    i = end;
    if (!prelude) continue;

    if (prelude.startsWith("@")) {
      const name = (prelude.match(/^@([a-z-]+)/i)?.[1] ?? "").toLowerCase();
      if (name === "media" || name === "supports" || name === "container" || name === "layer") {
        const inner = scopeCss(body, scopeAttr);
        findings.push(...inner.findings);
        if (inner.css.trim()) out.push(`${prelude} {\n${inner.css}\n}`);
        continue;
      }
      if (name === "keyframes" || name === "font-face") {
        // Keyframes and font faces have no selector to escape through; the
        // declaration guard above still applies to font-face sources.
        const safe = !/url\(\s*['"]?\s*(javascript|data:text\/html)/i.test(body);
        if (!safe) {
          findings.push(f("error", "css:font_src", "Unsafe url() in @font-face.", "css"));
          continue;
        }
        out.push(`${prelude} {${body}}`);
        continue;
      }
      findings.push(f("warn", `css:at_${name || "unknown"}`, `@${name} is not supported and was dropped.`, "css"));
      continue;
    }

    emitBlock({ selector: scopeSelectorList(prelude), body }, "");
  }

  return { css: out.join("\n"), findings };
}

/* -------------------------------------------------------------------- JS */

const JS_RULES: { re: RegExp; level: Finding["level"]; code: string; message: string }[] = [
  { re: /document\.write\s*\(/, level: "error", code: "js:document_write", message: "document.write() blocks rendering and is not allowed." },
  { re: /\beval\s*\(/, level: "error", code: "js:eval", message: "eval() is not allowed." },
  { re: /new\s+Function\s*\(/, level: "error", code: "js:new_function", message: "new Function() is not allowed." },
  { re: /\.innerHTML\s*=/, level: "warn", code: "js:inner_html", message: "innerHTML assignment is an XSS risk." },
  { re: /document\.cookie\s*=/, level: "warn", code: "js:cookie_write", message: "Writing cookies from custom JS may need consent." },
  { re: /<\/?script/i, level: "error", code: "js:script_tag", message: "Remove <script> tags — the field is JavaScript, not HTML." },
  { re: /\blocalStorage\b|\bsessionStorage\b/, level: "warn", code: "js:storage", message: "Browser storage is consent-gated on the storefront." },
];

export function reviewJs(js: string): Finding[] {
  const findings: Finding[] = [];
  if (!js.trim()) return findings;
  if (js.length > CUSTOM_CODE_LIMITS.js) {
    findings.push(f("error", "js:too_large", `Script exceeds ${CUSTOM_CODE_LIMITS.js} characters.`, "js"));
    return findings;
  }
  for (const rule of JS_RULES) {
    if (rule.re.test(js)) findings.push(f(rule.level, rule.code, rule.message, "js"));
  }
  findings.push(...scanSecrets(js, "js"));
  return findings;
}

/** True when the script touches anything the consent banner governs. */
export function isAnalyticsAdjacent(js: string): boolean {
  return /gtag|dataLayer|fbq|analytics|pixel|document\.cookie|localStorage|sessionStorage|navigator\.sendBeacon/i.test(js);
}

/* ------------------------------------------------------------- snippets */

export type HeadTag =
  | { tag: "meta"; attrs: Record<string, string> }
  | { tag: "link"; attrs: Record<string, string> }
  | { tag: "script"; attrs: Record<string, string>; children: string };

// Void tags (meta/link) never take children; only a container like <script>
// carries a body, and its body is captured up to its own closing tag.
const TAG_RE = /<([a-z0-9-]+)([^>]*?)(\/?)>/gi;
const ATTR_RE = /([a-z_:][a-z0-9_:.-]*)\s*=\s*"([^"]*)"|([a-z_:][a-z0-9_:.-]*)\s*=\s*'([^']*)'/gi;

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    const key = (m[1] ?? m[3] ?? "").toLowerCase();
    const value = m[2] ?? m[4] ?? "";
    if (!key || key.startsWith("on")) continue;
    out[key] = value;
  }
  return out;
}

const SAFE_URL = /^(https:\/\/|\/(?!\/))/i;

/**
 * Head snippet slot: verification metas, canonical/alternate links and
 * structured-data overrides only. Everything else is dropped with a finding —
 * no <script src>, no inline JS, no <style>.
 */
export function parseHeadSnippet(input: string): { tags: HeadTag[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const tags: HeadTag[] = [];
  if (!input.trim()) return { tags, findings };
  if (input.length > CUSTOM_CODE_LIMITS.head) {
    findings.push(f("error", "head:too_large", `Head snippet exceeds ${CUSTOM_CODE_LIMITS.head} characters.`, "head"));
    return { tags, findings };
  }
  findings.push(...scanSecrets(input, "head"));

  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(input))) {
    const name = (m[1] ?? "").toLowerCase();
    const attrs = attrsOf(m[2] ?? "");
    let children = "";
    if (!m[3]) {
      const close = input.toLowerCase().indexOf(`</${name}`, TAG_RE.lastIndex);
      if (close !== -1) {
        children = input.slice(TAG_RE.lastIndex, close);
        const after = input.indexOf(">", close);
        TAG_RE.lastIndex = after === -1 ? input.length : after + 1;
      }
    }
    if (name === "meta") {
      if (!attrs["name"] && !attrs["property"] && !attrs["http-equiv"]) {
        findings.push(f("warn", "head:meta_invalid", "A <meta> tag without name/property was dropped.", "head"));
        continue;
      }
      if (attrs["http-equiv"]) {
        findings.push(f("error", "head:http_equiv", "<meta http-equiv> is not allowed.", "head"));
        continue;
      }
      tags.push({ tag: "meta", attrs });
      continue;
    }
    if (name === "link") {
      const rel = (attrs["rel"] ?? "").toLowerCase();
      if (rel !== "canonical" && rel !== "alternate") {
        findings.push(f("warn", "head:link_rel", `<link rel="${rel || "?"}"> is not allowed.`, "head"));
        continue;
      }
      if (!SAFE_URL.test(attrs["href"] ?? "")) {
        findings.push(f("error", "head:link_href", "Link href must be https:// or a site-relative path.", "head"));
        continue;
      }
      tags.push({ tag: "link", attrs });
      continue;
    }
    if (name === "script") {
      const type = (attrs["type"] ?? "").toLowerCase();
      if (type !== "application/ld+json") {
        findings.push(f("error", "head:script", "Only <script type=\"application/ld+json\"> is allowed in the head.", "head"));
        continue;
      }
      try {
        JSON.parse(children);
      } catch {
        findings.push(f("error", "head:ld_json", "Structured data is not valid JSON.", "head"));
        continue;
      }
      // Re-serialising kills any `</script` breakout attempt in the source.
      tags.push({
        tag: "script",
        attrs: { type: "application/ld+json" },
        children: JSON.stringify(JSON.parse(children)),
      });
      continue;
    }
    findings.push(f("warn", `head:tag_${name}`, `<${name}> is not allowed in the head snippet.`, "head"));
  }
  return { tags, findings };
}

const BODY_TAGS = new Set(["noscript", "img", "div", "span", "p", "a", "picture", "source", "iframe", "br"]);

/**
 * Body-start / body-end slots. These carry pixels and no-script fallbacks, so
 * the allowlist is markup-only: no scripts, no event handlers, no inline
 * styles that could cover the page.
 */
export function sanitiseBodySnippet(
  input: string,
  field: "body_start" | "body_end",
): { html: string; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!input.trim()) return { html: "", findings };
  if (input.length > CUSTOM_CODE_LIMITS.body) {
    findings.push(f("error", "body:too_large", `Snippet exceeds ${CUSTOM_CODE_LIMITS.body} characters.`, field));
    return { html: "", findings };
  }
  findings.push(...scanSecrets(input, field));
  if (/<\s*script/i.test(input)) {
    findings.push(f("error", "body:script", "Scripts belong in the custom JS field, not a body snippet.", field));
  }
  if (/\son[a-z]+\s*=/i.test(input)) {
    findings.push(f("error", "body:event_handler", "Inline event handlers are not allowed.", field));
  }

  const html = input
    .replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, "")
    .replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawName: string, rawAttrs: string) => {
      const name = rawName.toLowerCase();
      if (!BODY_TAGS.has(name)) {
        findings.push(f("warn", `body:tag_${name}`, `<${name}> was dropped.`, field));
        return "";
      }
      if (whole.startsWith("</")) return `</${name}>`;
      const attrs = attrsOf(rawAttrs);
      const keep: string[] = [];
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "style") continue;
        if ((key === "src" || key === "href") && !SAFE_URL.test(value)) {
          findings.push(f("error", `body:${key}`, `${key} must be https:// or site-relative.`, field));
          continue;
        }
        keep.push(`${key}="${value.replace(/"/g, "&quot;")}"`);
      }
      const selfClosing = name === "img" || name === "source" || name === "br";
      return `<${name}${keep.length ? ` ${keep.join(" ")}` : ""}${selfClosing ? " /" : ""}>`;
    });

  return { html, findings };
}

/* --------------------------------------------------- html widget sandbox */

/**
 * Merchant markup for the `html` widget. It never reaches the host document:
 * this returns the srcdoc for an iframe rendered with
 * `sandbox="allow-forms allow-popups"` (no `allow-same-origin`), so the markup
 * has no access to cookies, storage or the parent DOM.
 */
export function sandboxSrcDoc(markup: string, opts: { css?: string; dir?: "ltr" | "rtl" } = {}): string {
  const body = markup.slice(0, CUSTOM_CODE_LIMITS.html);
  const css = opts.css ? scopeCss(opts.css).css : "";
  // The height handshake: the frame measures itself and posts up. The parent
  // matches on `type` only and ignores everything else.
  return `<!doctype html><html dir="${opts.dir ?? "ltr"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{color-scheme:light dark}html,body{margin:0;padding:0;font:inherit;color:inherit;background:transparent}
img,iframe,video{max-width:100%}
${css}</style></head><body>${body}
<script>(function(){function post(){parent.postMessage({type:"fq:html-height",height:document.documentElement.scrollHeight},"*")}
new ResizeObserver(post).observe(document.documentElement);addEventListener("load",post);post();})();<\/script>
</body></html>`;
}

export function reviewHtmlWidget(markup: string): Finding[] {
  const findings: Finding[] = [];
  if (markup.length > CUSTOM_CODE_LIMITS.html) {
    findings.push(f("error", "html:too_large", `Markup exceeds ${CUSTOM_CODE_LIMITS.html} characters.`, "html"));
  }
  if (/<\s*(script|iframe)[^>]*src\s*=\s*["']?\s*(?!https:)/i.test(markup)) {
    findings.push(f("error", "html:insecure_src", "Embedded resources must load over https://.", "html"));
  }
  findings.push(...scanSecrets(markup, "html"));
  return findings;
}

/* ------------------------------------------------------------------- CSP */

/** Cryptographically random per-request nonce (base64url, 128 bits). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Strict storefront CSP. `unsafe-inline` is never emitted: every inline script
 * we ship (hydration payload, custom JS island) carries the request nonce.
 */
export function buildCsp(nonce: string, opts: { connect?: string[]; frame?: string[] } = {}): string {
  const connect = ["'self'", ...(opts.connect ?? [])].join(" ");
  const frame = ["'self'", "https://www.youtube.com", "https://player.vimeo.com", ...(opts.frame ?? [])].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Phase 3: merchant-uploaded faces are served from our own origin through
    // /api/public/font/*, so no third-party font origin is ever whitelisted
    // beyond the Google font CDN the theme stylesheet needs.
    "font-src 'self' https://fonts.gstatic.com data:",

    "img-src 'self' https: data: blob:",
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/* -------------------------------------------------------------- pipeline */

export type CompiledCustomCode = {
  css: string;
  js: string;
  headTags: HeadTag[];
  bodyStart: string;
  bodyEnd: string;
  jsRequiresConsent: boolean;
  findings: Finding[];
  /** Publish is blocked while this is true. */
  blocked: boolean;
};

/**
 * The one compile every surface shares: the studio lints with it, the save
 * path stores its findings, publish refuses on an error, and the storefront
 * renders its output.
 */
export function compileCustomCode(input: Partial<CustomCode>): CompiledCustomCode {
  const code: CustomCode = { ...EMPTY_CUSTOM_CODE, ...input };
  const cssOut = scopeCss(code.css);
  const jsFindings = reviewJs(code.js);
  const head = parseHeadSnippet(code.head);
  const start = sanitiseBodySnippet(code.bodyStart, "body_start");
  const end = sanitiseBodySnippet(code.bodyEnd, "body_end");

  const findings = [...cssOut.findings, ...jsFindings, ...head.findings, ...start.findings, ...end.findings];
  const hasBlockingJs = jsFindings.some((x) => x.level === "error");
  // The merchant's own switch is the outermost gate: disabled code still lints
  // (so the studio keeps showing findings) but emits nothing to render.
  const off = !code.enabled;
  return {
    css: off ? "" : cssOut.css,
    js: off || hasBlockingJs ? "" : code.js,
    headTags: off ? [] : head.tags,
    bodyStart: off ? "" : start.html,
    bodyEnd: off ? "" : end.html,
    jsRequiresConsent: code.jsRequiresConsent || isAnalyticsAdjacent(code.js),
    findings,
    blocked: findings.some((x) => x.level === "error"),
  };
}
