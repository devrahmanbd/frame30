/**
 * Plugin JS deep scan — second-stage AST check for widget bundle entries.
 *
 * Both gates (`parseManifest` in `plugin-manifest.ts`, `validateBundle` in
 * `marketplace-scopes.ts`) run their regex first for cheap exact-code
 * preservation, then call `scanJsAst` as a second stage. The regexes miss
 * aliased and obfuscated dynamic code (`Reflect.construct(Function, …)`,
 * `setTimeout` aliases, comment-split callees, encoded payloads, `Function`
 * reached through member expressions), which this module catches.
 *
 * No npm dependencies: a hand-rolled tokenizer plus a single linear walk
 * over the token stream is sufficient for a fail-closed gate. The walk
 * tracks:
 * - aliases assigned from dangerous globals (`const e = eval; e('x')`),
 *   including `window.`/`globalThis.`-rooted and destructured forms;
 * - taint from decoders (`atob`, `decodeURIComponent`, `unescape`,
 *   `String.fromCharCode`/`fromCodePoint`) flowing into code-execution sinks;
 * - member-expression chains (`x.constructor.constructor(…)`,
 *   `Reflect.construct(Function, …)`, `window.eval(…)`);
 * - indirect calls through parenthesised groups (`(0, eval)('x')`,
 *   `new (x.constructor)('y')`).
 *
 * The walk never jumps over call interiors or declarator right-hand sides,
 * so nested calls (`foo(eval('x'))`, `const x = eval('y')`) still flag.
 * Template `${…}` interiors are re-scanned recursively (depth-capped).
 *
 * Known limitations (documented, not silent): homograph identifiers
 * (non-ASCII lookalikes of `eval`), array-destructured aliases
 * (`const [e] = [eval]`), and nested template literals inside `${…}`
 * (single-level `${…}` is fully covered).
 *
 * Pure module: no network, no database, no React. Non-string input scans
 * clean (type errors belong to the calling gate, not this scanner).
 */

import { MANIFEST_ENTRY_DYNAMIC_CODE_RE } from "./plugin-manifest";
import { BUNDLE_ENTRY_DYNAMIC_CODE_RE } from "./marketplace-scopes";

export type JsFinding = { rule: string; excerpt: string };
export type JsScanResult = { ok: boolean; findings: JsFinding[] };
export type JsScanDomain = "manifest" | "bundle";

/* ------------------------------------------------------------------ tokens */

type TokKind =
  "ident" | "string" | "template" | "number" | "regex" | "punct" | "other";

type Tok = {
  kind: TokKind;
  /** Decoded for ident/string (unicode/escape sequences resolved). */
  value: string;
  /** True for template literals containing at least one ${…} substitution. */
  dynamic: boolean;
  start: number;
  end: number;
  /** `${…}` interior spans (absolute offsets) for dynamic templates. */
  subs: { start: number; end: number }[];
};

type RawFinding = { rule: string; start: number; end: number };

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function decodeUnicodeEscape(
  src: string,
  i: number,
): { ch: string; next: number } | null {
  // i points just past the leading backslash-u (`\uXXXX` or `\u{X…}`).
  if (src[i] !== "u") return null;
  if (src[i + 1] === "{") {
    const close = src.indexOf("}", i + 2);
    if (close < 0) return null;
    const cp = Number.parseInt(src.slice(i + 2, close), 16);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null;
    return { ch: String.fromCodePoint(cp), next: close + 1 };
  }
  const hex = src.slice(i + 1, i + 5);
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
  return { ch: String.fromCharCode(Number.parseInt(hex, 16)), next: i + 5 };
}

function decodeStringEscapes(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] as string;
    if (ch !== "\\" || i + 1 >= body.length) {
      out += ch;
      continue;
    }
    const n = body[i + 1] as string;
    if (n === "u" && i + 2 < body.length) {
      if (body[i + 2] === "{") {
        const close = body.indexOf("}", i + 3);
        if (close > 0) {
          const cp = Number.parseInt(body.slice(i + 3, close), 16);
          if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
            out += String.fromCodePoint(cp);
            i = close;
            continue;
          }
        }
        out += n;
        i += 1;
        continue;
      }
      const hex = body.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 5;
        continue;
      }
      out += n;
      i += 1;
      continue;
    }
    if (n === "x") {
      const hex = body.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 3;
        continue;
      }
      out += n;
      i += 1;
      continue;
    }
    const simple: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "0": "\0",
      "'": "'",
      '"': '"',
      "\\": "\\",
    };
    if (n in simple) {
      if (n === "0" && /[0-9]/.test(body[i + 2] ?? "")) {
        // `\0` followed by a digit is an octal escape — decode it below.
      } else {
        out += simple[n] as string;
        i += 1;
        continue;
      }
    }
    const oct = /^[0-7]{1,3}/.exec(body.slice(i + 1));
    if (oct) {
      out += String.fromCharCode(Number.parseInt(oct[0], 8));
      i += oct[0].length;
      continue;
    }
    if (n === "\n") {
      i += 1; // line continuation contributes nothing
      continue;
    }
    out += n;
    i += 1;
  }
  return out;
}

const PUNCTS = [
  ">>>=",
  "===",
  "!==",
  ">>>",
  "<<=",
  ">>=",
  "**=",
  "&&=",
  "||=",
  "??=",
  "&&",
  "||",
  "??",
  "**",
  "=>",
  "?.",
  "...",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "++",
  "--",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ";",
  ":",
  ".",
  "?",
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "&",
  "|",
  "^",
  "!",
  "~",
];

const REGEX_ALLOWED_BEFORE = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
  "^",
  "~",
  "=>",
  "==",
  "===",
  "!=",
  "!==",
  "&&",
  "||",
  "??",
  "**",
]);

const REGEX_ALLOWED_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/** Consume a regex literal starting at the opening `/` (index i). */
function consumeRegex(src: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j] as string;
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "\n") return -1;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      let k = j + 1;
      while (/[a-z]/i.test(src[k] ?? "")) k += 1;
      return k;
    }
    j += 1;
  }
  return -1;
}

function tokenize(src: string): { toks: Tok[]; masked: string } {
  const toks: Tok[] = [];
  const mask: (string | null)[] = new Array(src.length).fill(null);
  const blank = (from: number, to: number, keepFirst: boolean) => {
    for (let k = from + (keepFirst ? 1 : 0); k < to; k += 1) {
      if (src[k] !== "\n") mask[k] = " ";
    }
  };
  let i = 0;
  const push = (
    kind: TokKind,
    value: string,
    start: number,
    end: number,
    dynamic = false,
    subs: { start: number; end: number }[] = [],
  ) => {
    toks.push({ kind, value, start, end, dynamic, subs });
  };
  const prevSignificant = (): Tok | null =>
    toks.length ? (toks[toks.length - 1] as Tok) : null;

  while (i < src.length) {
    const ch = src[i] as string;
    // Whitespace.
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    // Comments — blanked in the masked source so non-code text never
    // trips the regex pre-pass.
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2);
      const end = nl < 0 ? src.length : nl;
      blank(i, end, false);
      i = end;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close < 0 ? src.length : close + 2;
      blank(i, end, false);
      i = end;
      continue;
    }
    // Strings — contents blanked (the opening quote is kept so the
    // pre-pass still sees the code shape `setTimeout("…")`).
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j += 1;
        j += 1;
      }
      const end = Math.min(j + 1, src.length);
      push("string", decodeStringEscapes(src.slice(i + 1, j)), i, end);
      blank(i, end, true);
      i = end;
      continue;
    }
    // Template literals — interiors recorded for recursive re-scanning.
    if (ch === "`") {
      let j = i + 1;
      let dynamic = false;
      let depth = 0;
      let inExpr = false;
      let subStart = 0;
      const subs: { start: number; end: number }[] = [];
      let body = "";
      while (j < src.length) {
        const c = src[j] as string;
        if (!inExpr) {
          if (c === "\\") {
            body += src.slice(j, j + 2);
            j += 2;
            continue;
          }
          if (c === "`") {
            j += 1;
            break;
          }
          if (c === "$" && src[j + 1] === "{") {
            dynamic = true;
            inExpr = true;
            depth = 1;
            subStart = j + 2;
            body += "${";
            j += 2;
            continue;
          }
          body += c;
          j += 1;
          continue;
        }
        // Inside ${…}: skip strings/comments/regexes, count braces.
        if (c === "'" || c === '"') {
          const q = c;
          let k = j + 1;
          while (k < src.length && src[k] !== q) {
            if (src[k] === "\\") k += 1;
            k += 1;
          }
          j = Math.min(k + 1, src.length);
          continue;
        }
        if (c === "`") {
          // Nested template inside ${…}: single-level support — the
          // recursive re-scan of this interior handles its own ${…}.
          let k = j + 1;
          let nestedDynamic = false;
          while (k < src.length) {
            const d = src[k] as string;
            if (d === "\\") {
              k += 2;
              continue;
            }
            if (d === "`") break;
            if (d === "$" && src[k + 1] === "{") nestedDynamic = true;
            k += 1;
          }
          void nestedDynamic;
          j = Math.min(k + 1, src.length);
          continue;
        }
        if (c === "/" && (src[j + 1] === "/" || src[j + 1] === "*")) {
          if (src[j + 1] === "/") {
            const nl = src.indexOf("\n", j + 2);
            j = nl < 0 ? src.length : nl + 1;
          } else {
            const close = src.indexOf("*/", j + 2);
            j = close < 0 ? src.length : close + 2;
          }
          continue;
        }
        if (c === "/" && src[j + 1] !== "/" && src[j + 1] !== "*") {
          const rend = consumeRegex(src, j);
          if (rend > 0) {
            j = rend;
            continue;
          }
          j += 1;
          continue;
        }
        if (c === "{") depth += 1;
        if (c === "}") {
          depth -= 1;
          if (depth === 0) {
            subs.push({ start: subStart, end: j });
            inExpr = false;
            j += 1;
            continue;
          }
        }
        j += 1;
      }
      push("template", decodeStringEscapes(body), i, j, dynamic, subs);
      blank(i, j, true);
      i = j;
      continue;
    }
    // Numbers.
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m =
        /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)(?:\.[\d_]*)?(?:[eE][+-]?[\d_]+)?|\.[\d_]+(?:[eE][+-]?[\d_]+)?)(?:n)?/.exec(
          src.slice(i),
        );
      const len = m ? m[0].length : 1;
      push("number", src.slice(i, i + len), i, i + len);
      i += len;
      continue;
    }
    // Identifiers (decode \u escapes so \u0065val reads as eval).
    if (isIdentStart(ch) || (ch === "\\" && src[i + 1] === "u")) {
      let value = "";
      let j = i;
      if (isIdentStart(ch)) {
        value += ch;
        j += 1;
      }
      for (;;) {
        const c = src[j] ?? "";
        if (c === "\\" && src[j + 1] === "u") {
          const d = decodeUnicodeEscape(src, j + 1);
          if (!d) break;
          value += d.ch;
          j = d.next;
          continue;
        }
        if (j > i && isIdentPart(c)) {
          value += c;
          j += 1;
          continue;
        }
        break;
      }
      if (j === i) {
        push("other", ch, i, i + 1);
        i += 1;
        continue;
      }
      push("ident", value, i, j);
      i = j;
      continue;
    }
    // Private names (#x) — opaque single tokens, never dangerous names.
    if (ch === "#") {
      let j = i + 1;
      while (isIdentPart(src[j] ?? "")) j += 1;
      push("ident", src.slice(i, j), i, j);
      i = j;
      continue;
    }
    // Regex literal vs division.
    if (ch === "/" && src[i + 1] !== "/" && src[i + 1] !== "*") {
      if (src[i + 1] === "=") {
        push("punct", "/=", i, i + 2);
        i += 2;
        continue;
      }
      const prev = prevSignificant();
      const regexOk =
        !prev ||
        (prev.kind === "punct" && REGEX_ALLOWED_BEFORE.has(prev.value)) ||
        (prev.kind === "ident" && REGEX_ALLOWED_KEYWORDS.has(prev.value));
      if (regexOk) {
        const rend = consumeRegex(src, i);
        if (rend > 0) {
          push("regex", src.slice(i, rend), i, rend);
          blank(i, rend, false);
          i = rend;
          continue;
        }
      }
      push("punct", "/", i, i + 1);
      i += 1;
      continue;
    }
    // Punctuators (longest match; `?.` not followed by a digit).
    let matched: string | null = null;
    for (const p of PUNCTS) {
      if (src.startsWith(p, i)) {
        if (p === "?." && /[0-9]/.test(src[i + 2] ?? "")) continue;
        matched = p;
        break;
      }
    }
    if (matched) {
      push("punct", matched, i, i + matched.length);
      i += matched.length;
      continue;
    }
    // Anything else (stray backslashes, non-ASCII lookalikes, emoji):
    // opaque single-char tokens. These break callee adjacency — so
    // `/eval\(/` can never read as an eval call — without hiding code.
    push("other", ch, i, i + 1);
    i += 1;
  }
  const masked = src
    .split("")
    .map((c, k) => mask[k] ?? c)
    .join("");
  return { toks, masked };
}

/* ---------------------------------------------------------------- analysis */

type AliasKind =
  | "eval"
  | "Function"
  | "setTimeout"
  | "setInterval"
  | "Reflect"
  | "document"
  | "global";

type ChainProp = { name: string | null };
type Chain = {
  root: string;
  rootKind: AliasKind | null;
  props: ChainProp[];
  start: number;
  end: number;
  endTok: number; // exclusive token index
};

const BARE_DANGEROUS: Record<string, AliasKind> = {
  eval: "eval",
  Function: "Function",
  setTimeout: "setTimeout",
  setInterval: "setInterval",
  Reflect: "Reflect",
  document: "document",
};

const WINDOW_ROOTS = new Set(["window", "globalThis", "self", "global"]);

const DECODERS = new Set([
  "atob",
  "decodeURI",
  "decodeURIComponent",
  "unescape",
  "fromCharCode",
  "fromCodePoint",
]);

class Scanner {
  src: string;
  toks: Tok[];
  alias = new Map<string, AliasKind>();
  tainted = new Set<string>();
  findings: RawFinding[] = [];

  constructor(src: string, toks: Tok[]) {
    this.src = src;
    this.toks = toks;
  }

  tok(i: number): Tok | null {
    return i >= 0 && i < this.toks.length ? (this.toks[i] as Tok) : null;
  }

  is(i: number, kind: TokKind, value?: string): boolean {
    const t = this.tok(i);
    return !!t && t.kind === kind && (value === undefined || t.value === value);
  }

  flag(rule: string, start: number, end: number): void {
    if (this.findings.length < 50) this.findings.push({ rule, start, end });
  }

  /** Parse `ident (. prop | [ lit ])*` starting at token i. */
  parseChain(i: number): Chain | null {
    const first = this.tok(i);
    if (!first || first.kind !== "ident") return null;
    const root = first.value;
    const rootKind =
      BARE_DANGEROUS[root] ??
      this.alias.get(root) ??
      (WINDOW_ROOTS.has(root) ? "global" : null);
    const props: ChainProp[] = [];
    let j = i + 1;
    for (;;) {
      const dot = this.tok(j);
      if (
        dot &&
        dot.kind === "punct" &&
        (dot.value === "." || dot.value === "?.")
      ) {
        const name = this.tok(j + 1);
        if (name && name.kind === "ident") {
          props.push({ name: name.value });
          j += 2;
          continue;
        }
        break;
      }
      if (this.is(j, "punct", "[")) {
        const lit = this.tok(j + 1);
        const close = this.tok(j + 2);
        if (
          lit &&
          (lit.kind === "string" || lit.kind === "number") &&
          close &&
          close.kind === "punct" &&
          close.value === "]"
        ) {
          props.push({ name: lit.kind === "string" ? lit.value : null });
          j += 3;
          continue;
        }
        // Non-literal computed access — unresolvable; skip the bracket group.
        let k = j + 1;
        let depth = 1;
        while (k < this.toks.length && depth > 0) {
          const t = this.toks[k] as Tok;
          if (t.kind === "punct" && t.value === "[") depth += 1;
          else if (t.kind === "punct" && t.value === "]") depth -= 1;
          k += 1;
        }
        props.push({ name: null });
        j = k;
        continue;
      }
      break;
    }
    const lastTok = this.tok(j - 1) ?? first;
    return {
      root,
      rootKind,
      props,
      start: first.start,
      end: lastTok.end,
      endTok: j,
    };
  }

  propNames(chain: Chain): (string | null)[] {
    return chain.props.map((p) => p.name);
  }

  /** Does the chain pass through a `constructor` property? */
  constructorSegments(chain: Chain): number {
    return chain.props.filter((p) => p.name === "constructor").length;
  }

  /**
   * True when the value item starting at token i is itself a call
   * (`eval('y')`, `foo.bar()`…, or a tagged template). Group resolution
   * skips such items — the linear walk flags the inner call directly,
   * which avoids double-reporting `f(eval('y'))` at the group level.
   */
  isCallItem(itemStart: number): boolean {
    const chain = this.parseChain(itemStart);
    if (!chain) return false;
    const after = this.tok(chain.endTok);
    if (!after) return false;
    if (after.kind === "template") return true;
    return (
      after.kind === "punct" && (after.value === "(" || after.value === "?.")
    );
  }

  /** Resolve a value expression at token i to a dangerous kind, if any. */
  resolveValue(i: number, depth = 0): AliasKind | null {
    if (depth > 4) return null;
    const t = this.tok(i);
    if (!t) return null;
    // Parenthesised / comma-sequence: (0, eval) / (eval) / (a || eval).
    if (t.kind === "punct" && t.value === "(") {
      let j = i + 1;
      let level = 1;
      const items: number[] = [j];
      const ors: number[] = [];
      while (j < this.toks.length && level > 0) {
        const u = this.toks[j] as Tok;
        if (
          u.kind === "punct" &&
          (u.value === "(" || u.value === "[" || u.value === "{")
        )
          level += 1;
        else if (
          u.kind === "punct" &&
          (u.value === ")" || u.value === "]" || u.value === "}")
        ) {
          level -= 1;
          if (level === 0) break;
        } else if (level === 1 && u.kind === "punct" && u.value === ",")
          items.push(j + 1);
        else if (
          level === 1 &&
          u.kind === "punct" &&
          (u.value === "||" || u.value === "??")
        )
          ors.push(j + 1);
        j += 1;
      }
      for (const o of ors) {
        const k = this.resolveValue(o, depth + 1);
        if (k) return k;
      }
      const lastItem = items[items.length - 1] as number;
      if (!this.isCallItem(lastItem)) {
        return this.resolveValue(lastItem, depth + 1);
      }
      return null;
    }
    if (t.kind !== "ident") return null;
    // Chained assignment on the RHS: a = b = eval.
    const chain = this.parseChain(i);
    if (!chain) return null;
    const after = this.tok(chain.endTok);
    if (
      !chain.props.length &&
      after &&
      after.kind === "punct" &&
      after.value === "="
    ) {
      return this.resolveValue(chain.endTok + 1, depth + 1);
    }
    // Constructor-derived references resolve to the Function constructor.
    if (this.constructorSegments(chain) > 0) return "Function";
    if (!chain.props.length) {
      // Bare dangerous globals AND bare global roots (window, globalThis…)
      // resolve here; the latter lets `const w = window; w.eval('x')` flag.
      return chain.rootKind;
    }
    const names = this.propNames(chain);
    const last = names[names.length - 1] as string | null;
    const baseGlobal =
      chain.rootKind === "global" ||
      (WINDOW_ROOTS.has(chain.root) && chain.rootKind !== null);
    if (
      last === "eval" ||
      last === "Function" ||
      last === "setTimeout" ||
      last === "setInterval"
    ) {
      if (baseGlobal) return last as AliasKind;
      return null;
    }
    if (last === "document" && baseGlobal) return "document";
    if (last === "Reflect" && baseGlobal) return "Reflect";
    return null;
  }

  /** Is token i the start of a decoder call whose callee resolves? */
  isDecoderCall(i: number): boolean {
    const chain = this.parseChain(i);
    if (!chain) return false;
    const names = this.propNames(chain);
    const callee = names.length ? names[names.length - 1] : chain.root;
    if (!DECODERS.has(callee ?? "")) return false;
    if (names.length === 0) return true; // bare decoder
    // Member decoder: allow String.fromCharCode or any global-rooted form.
    return (
      chain.root === "String" || chain.rootKind === "global" || !!chain.rootKind
    );
  }

  /** Scan the token range [from, to) for decoder calls or tainted idents. */
  rangeIsEncoded(from: number, to: number): boolean {
    for (let k = from; k < to; k += 1) {
      const t = this.toks[k] as Tok;
      if (t.kind === "ident" && this.tainted.has(t.value)) return true;
      if (t.kind === "ident" && this.isDecoderCall(k)) return true;
    }
    return false;
  }

  /** First-argument analysis for timer/Function/eval calls. */
  firstArgInfo(openParen: number): { first: number; close: number } | null {
    // openParen points at "(".
    let j = openParen + 1;
    let level = 1;
    let comma = -1;
    let closed = false;
    while (j < this.toks.length && level > 0) {
      const t = this.toks[j] as Tok;
      if (
        t.kind === "punct" &&
        (t.value === "(" || t.value === "[" || t.value === "{")
      )
        level += 1;
      else if (
        t.kind === "punct" &&
        (t.value === ")" || t.value === "]" || t.value === "}")
      ) {
        level -= 1;
        if (level === 0) {
          closed = true;
          break;
        }
      } else if (level === 1 && t.kind === "punct" && t.value === ",") {
        comma = j;
        break;
      }
      j += 1;
    }
    // A comma ends the first argument even though the group is still open;
    // only a fully unbalanced group (never closed, no comma) is opaque.
    if (!closed && comma < 0) return null;
    const end = comma >= 0 ? comma : j;
    // A leading spread is opaque: setTimeout(...args) is allowed.
    if (this.is(openParen + 1, "punct", "...")) return null;
    if (openParen + 1 >= end) return { first: -1, close: j }; // no args
    return { first: openParen + 1, close: j };
  }

  /** Track `name = RHS` / `var name = RHS` assignments (alias + taint). */
  trackAssign(name: string, rhs: number, rhsEnd: number): void {
    const kind = this.resolveValue(rhs);
    if (kind) {
      this.alias.set(name, kind);
    } else if (this.rangeIsEncoded(rhs, rhsEnd)) {
      this.alias.delete(name);
      this.tainted.add(name);
    } else {
      this.alias.delete(name);
      this.tainted.delete(name);
    }
  }

  /** End of an RHS expression: top-level `,` `;` `)` `]` `}` or EOF. */
  rhsEnd(from: number): number {
    let j = from;
    let p = 0;
    let b = 0;
    let c = 0;
    while (j < this.toks.length) {
      const t = this.toks[j] as Tok;
      if (t.kind === "punct") {
        if (t.value === "(") p += 1;
        else if (t.value === "[") b += 1;
        else if (t.value === "{") c += 1;
        else if (t.value === ")") {
          if (p === 0 && b === 0 && c === 0) break;
          p -= 1;
        } else if (t.value === "]") {
          if (p === 0 && b === 0 && c === 0) break;
          b -= 1;
        } else if (t.value === "}") {
          if (p === 0 && b === 0 && c === 0) break;
          c -= 1;
        } else if (
          (t.value === "," || t.value === ";") &&
          p === 0 &&
          b === 0 &&
          c === 0
        )
          break;
      }
      j += 1;
    }
    return j;
  }
}

/* ------------------------------------------------------------- rule engine */

function excerptOf(src: string, start: number, end: number): string {
  const lo = Math.max(0, start - 24);
  const hi = Math.min(src.length, end + 24);
  const collapsed = src.slice(lo, hi).replace(/\s+/g, " ").trim();
  return collapsed.length > 160 ? `${collapsed.slice(0, 159)}…` : collapsed;
}

/** Match the bracket group opening at token `open` (any of (), [], {}). */
function matchGroup(sc: Scanner, open: number): number {
  const toks = sc.toks;
  const stack: string[] = [];
  for (let j = open; j < toks.length; j += 1) {
    const t = toks[j] as Tok;
    if (t.kind !== "punct") continue;
    if (t.value === "(" || t.value === "[" || t.value === "{")
      stack.push(t.value);
    else if (t.value === ")" || t.value === "]" || t.value === "}") {
      stack.pop();
      if (stack.length === 0) return j;
    }
  }
  return toks.length - 1;
}

function findOpenParen(sc: Scanner, from: number): number {
  const toks = sc.toks;
  let j = from;
  const t0 = toks[j] as Tok | undefined;
  if (t0 && t0.kind === "punct" && t0.value === "?.") j += 1;
  const t = toks[j] as Tok | undefined;
  return t && t.kind === "punct" && t.value === "(" ? j : -1;
}

function openOf(sc: Scanner, chain: Chain): number {
  return findOpenParen(sc, chain.endTok);
}

/** Timer with a string / template / tainted / decoded first argument. */
function flagStringTimer(sc: Scanner, chain: Chain, open: number): void {
  if (open < 0) {
    // Tagged template: setTimeout`code` — the template is the payload.
    const t = sc.tok(chain.endTok);
    if (t && t.kind === "template") sc.flag("string-timer", chain.start, t.end);
    return;
  }
  const arg = sc.firstArgInfo(open);
  if (!arg || arg.first < 0) return;
  const first = sc.tok(arg.first);
  const close = sc.tok(arg.close);
  if (!first) return;
  const end = close ? close.end : first.end;
  if (first.kind === "string" || first.kind === "template") {
    sc.flag("string-timer", chain.start, end);
    return;
  }
  // Decoded or tainted identifier payload: setTimeout(c) after atob.
  if (first.kind === "ident" && sc.tainted.has(first.value)) {
    sc.flag("string-timer", chain.start, end);
    sc.flag("encoded-payload", chain.start, end);
    return;
  }
  if (sc.rangeIsEncoded(arg.first, arg.close)) {
    sc.flag("string-timer", chain.start, end);
    sc.flag("encoded-payload", chain.start, end);
  }
}

/** eval(…)/Function(…) whose payload is decoded or tainted. */
function flagEncodedArg(sc: Scanner, open: number): void {
  if (open < 0) return;
  const arg = sc.firstArgInfo(open);
  if (!arg || arg.first < 0) return;
  const first = sc.tok(arg.first);
  const close = sc.tok(arg.close);
  if (!first) return;
  const end = close ? close.end : first.end;
  if (sc.rangeIsEncoded(arg.first, arg.close)) {
    // The base finding (eval-call / function-constructor) is already flagged;
    // this records the encoded-payload combo explicitly.
    sc.flag("encoded-payload", first.start, end);
  }
}

function scAliasIs(sc: Scanner, root: string, kind: AliasKind): boolean {
  return sc.alias.get(root) === kind;
}

function baseGlobalReflect(chain: Chain, sc: Scanner): boolean {
  // window.Reflect.construct(…) — Reflect reached through a global root.
  const names = sc.propNames(chain);
  if (names.length >= 2 && names[names.length - 2] === "Reflect") {
    return chain.rootKind === "global" || WINDOW_ROOTS.has(chain.root);
  }
  return false;
}

function chainResolvesDocument(chain: Chain, sc: Scanner): boolean {
  if (chain.root === "document" && chain.props.length >= 1) return true;
  if (scAliasIs(sc, chain.root, "document")) return true;
  const names = sc.propNames(chain);
  if (names.length >= 2 && names[names.length - 2] === "document") {
    return chain.rootKind === "global" || WINDOW_ROOTS.has(chain.root);
  }
  return false;
}

function checkCall(sc: Scanner, chain: Chain, callEnd: number): void {
  const names = sc.propNames(chain);
  // Bare roots resolve through the alias map: `const e = eval; e('x')` must
  // read as eval, not as an unknown identifier `e`.
  const bareKind =
    names.length === 0 &&
    (chain.rootKind === "eval" ||
      chain.rootKind === "Function" ||
      chain.rootKind === "setTimeout" ||
      chain.rootKind === "setInterval")
      ? (chain.rootKind as string)
      : null;
  const last = names.length
    ? names[names.length - 1]
    : (bareKind ?? chain.root);
  const baseGlobal =
    chain.rootKind === "global" ||
    (WINDOW_ROOTS.has(chain.root) && chain.rootKind !== null);

  // Reflect.construct / Reflect.apply with a Function-ish first argument.
  if (
    (last === "construct" || last === "apply") &&
    (chain.root === "Reflect" ||
      scAliasIs(sc, chain.root, "Reflect") ||
      (names.length > 1 && names[names.length - 2] === "Reflect") ||
      baseGlobalReflect(chain, sc))
  ) {
    const open = findOpenParen(sc, chain.endTok);
    if (open >= 0) {
      const arg = sc.firstArgInfo(open);
      if (arg && arg.first >= 0) {
        const k = sc.resolveValue(arg.first);
        if (k === "Function" || k === "eval") {
          sc.flag("reflect-construct", chain.start, callEnd);
        }
      }
    }
    return;
  }

  if (
    last === "eval" &&
    (names.length === 0 || baseGlobal || scAliasIs(sc, chain.root, "eval"))
  ) {
    sc.flag("eval-call", chain.start, callEnd);
    flagEncodedArg(sc, openOf(sc, chain));
    return;
  }
  if (
    last === "Function" &&
    (names.length === 0 || baseGlobal || scAliasIs(sc, chain.root, "Function"))
  ) {
    sc.flag("function-constructor", chain.start, callEnd);
    flagEncodedArg(sc, openOf(sc, chain));
    return;
  }
  if (last === "setTimeout" || last === "setInterval") {
    flagStringTimer(sc, chain, openOf(sc, chain));
    return;
  }
  if (
    (last === "write" || last === "writeln") &&
    chainResolvesDocument(chain, sc)
  ) {
    sc.flag("document-write", chain.start, callEnd);
    return;
  }
  // Constructor reached through property access, then called:
  // x.constructor(…) / x.constructor.constructor(…).
  if (sc.constructorSegments(chain) > 0) {
    sc.flag("constructor-chain", chain.start, callEnd);
    return;
  }
}

/**
 * Indirect call through a parenthesised group: `(0, eval)('x')`,
 * `(x.constructor)('y')`. The group must be followed by a second call
 * paren (or a tag template); a bare `(0, eval)` reference is harmless.
 * Returns the end offset when a finding was flagged.
 */
function checkGroupCall(sc: Scanner, groupOpen: number): number | null {
  const toks = sc.toks;
  const close = matchGroup(sc, groupOpen);
  const nx = toks[close + 1] as Tok | undefined;
  const isTemplate = !!nx && nx.kind === "template";
  const open2 =
    nx && nx.kind === "punct" && (nx.value === "(" || nx.value === "?.")
      ? findOpenParen(sc, close + 1)
      : -1;
  if (!isTemplate && open2 < 0) return null;
  const kind = sc.resolveValue(groupOpen);
  if (!kind || kind === "global" || kind === "document" || kind === "Reflect")
    return null;
  const endTok = isTemplate ? close + 1 : matchGroup(sc, open2);
  const end = (toks[endTok] as Tok | undefined)?.end ?? sc.src.length;
  const groupStart = (toks[groupOpen] as Tok).start;
  if (kind === "eval") {
    sc.flag("eval-call", groupStart, end);
    if (!isTemplate) flagEncodedArg(sc, open2);
    return end;
  }
  if (kind === "Function") {
    sc.flag("function-constructor", groupStart, end);
    if (!isTemplate) flagEncodedArg(sc, open2);
    return end;
  }
  // Timer kinds: analyse the second paren's first argument.
  flagStringTimer(
    sc,
    {
      root: kind,
      rootKind: kind,
      props: [],
      start: groupStart,
      end,
      endTok: close + 1,
    },
    open2,
  );
  return end;
}

/* ------------------------------------------------------------------ driver */

function walk(src: string, toks: Tok[]): RawFinding[] {
  const sc = new Scanner(src, toks);
  const n = toks.length;
  const peek = (k: number): Tok | null =>
    k >= 0 && k < n ? (toks[k] as Tok) : null;

  let i = 0;
  while (i < n) {
    const t = toks[i] as Tok;

    // Static + dynamic import.
    if (t.kind === "ident" && t.value === "import") {
      const nx = peek(i + 1);
      if (nx && nx.kind === "punct" && nx.value === "(") {
        const close = sc.firstArgInfo(i + 1);
        sc.flag(
          "dynamic-import",
          t.start,
          close && toks[close.close] ? (toks[close.close] as Tok).end : nx.end,
        );
        i += 1;
        continue;
      }
      if (nx && nx.kind === "punct" && nx.value === ".") {
        i += 1; // import.meta — metadata access, not a module load
        continue;
      }
      sc.flag("static-import", t.start, t.end);
      i += 1;
      continue;
    }

    // export … from '…' (export default / export const stay clean).
    if (t.kind === "ident" && t.value === "export") {
      let depth = 0;
      let hit: { start: number; end: number } | null = null;
      for (let k = 0; k < 14 && i + 1 + k < n; k += 1) {
        const u = toks[i + 1 + k] as Tok;
        if (u.kind === "punct" && (u.value === ";" || u.value === "}")) break;
        if (u.kind === "ident" && u.value === "from" && depth === 0) {
          const v = toks[i + 1 + k + 1] as Tok | undefined;
          if (v && (v.kind === "string" || v.kind === "template")) {
            hit = { start: t.start, end: v.end };
          }
          break;
        }
        if (
          u.kind === "punct" &&
          (u.value === "{" || u.value === "(" || u.value === "[")
        )
          depth += 1;
        if (
          u.kind === "punct" &&
          (u.value === "}" || u.value === ")" || u.value === "]")
        ) {
          if (depth === 0) break;
          depth -= 1;
        }
      }
      if (hit) sc.flag("export-from", hit.start, hit.end);
      i += 1;
      continue;
    }

    // new-target / new-expression (incl. `new (group)(args)`).
    if (t.kind === "ident" && t.value === "new") {
      const nx = peek(i + 1);
      if (nx && nx.kind === "punct" && nx.value === ".") {
        i += 3; // new.target
        continue;
      }
      if (nx && nx.kind === "punct" && nx.value === "(") {
        // `new (group)` — when a second call paren follows, the normal
        // group path flags it; otherwise resolve the group directly
        // (`new (0, eval)` is still a malicious shape) and walk inside.
        const close = matchGroup(sc, i + 1);
        const nx2 = toks[close + 1] as Tok | undefined;
        const hasCall =
          !!nx2 &&
          (nx2.kind === "template" ||
            (nx2.kind === "punct" &&
              (nx2.value === "(" || nx2.value === "?.")));
        if (!hasCall) {
          const kind = sc.resolveValue(i + 1);
          if (kind === "Function" || kind === "eval") {
            sc.flag(
              kind === "Function" ? "function-constructor" : "eval-call",
              t.start,
              (toks[close] as Tok).end,
            );
          }
        }
        i = i + 1; // walk into the group; nested calls still flag
        continue;
      }
      const chain = sc.parseChain(i + 1);
      if (!chain) {
        i += 1;
        continue;
      }
      const open = findOpenParen(sc, chain.endTok);
      const kind = sc.resolveValue(i + 1);
      if (kind === "Function" || kind === "eval") {
        const endTok = open >= 0 ? matchGroup(sc, open) : chain.endTok - 1;
        const end =
          open >= 0 && toks[endTok] ? (toks[endTok] as Tok).end : chain.end;
        sc.flag(
          kind === "Function" ? "function-constructor" : "eval-call",
          t.start,
          end,
        );
      } else if (sc.constructorSegments(chain) > 0) {
        const endTok = open >= 0 ? matchGroup(sc, open) : chain.endTok - 1;
        const end =
          open >= 0 && toks[endTok] ? (toks[endTok] as Tok).end : chain.end;
        sc.flag("constructor-chain", t.start, end);
      }
      i = chain.endTok; // walk into arguments; nested calls still flag
      continue;
    }

    // var/let/const — track one declarator head, then walk the rest.
    if (
      t.kind === "ident" &&
      (t.value === "var" || t.value === "let" || t.value === "const")
    ) {
      i = scanDeclaration(sc, i + 1);
      continue;
    }

    // function/class names shadow an alias from here on.
    if (t.kind === "ident" && (t.value === "function" || t.value === "class")) {
      let j = i + 1;
      if (peek(j)?.kind === "punct" && peek(j)?.value === "*") j += 1;
      const name = peek(j);
      if (name && name.kind === "ident") {
        sc.alias.delete(name.value);
        i = j + 1;
        continue;
      }
      i += 1;
      continue;
    }

    // Parenthesised groups: indirect calls `(0, eval)('x')`, otherwise walk in.
    if (t.kind === "punct" && t.value === "(") {
      checkGroupCall(sc, i);
      i += 1;
      continue;
    }

    // Member / identifier chains: calls, tagged templates, assignments.
    if (t.kind === "ident") {
      const chain = sc.parseChain(i);
      if (!chain) {
        i += 1;
        continue;
      }
      const after = peek(chain.endTok);
      // Call: callee ( … ) / callee ?.( … ) / callee `…`.
      if (
        after &&
        after.kind === "punct" &&
        (after.value === "(" || after.value === "?.")
      ) {
        const open = findOpenParen(sc, chain.endTok);
        if (open >= 0) {
          const endTok = matchGroup(sc, open);
          const end = toks[endTok] ? (toks[endTok] as Tok).end : after.end;
          checkCall(sc, chain, end);
        }
        i = chain.endTok; // land on the paren: groups get indirect-call
        continue; // analysis, then interiors are walked; nested calls flag
      }
      if (after && after.kind === "template") {
        checkCall(sc, chain, after.end);
        i = chain.endTok + 1;
        continue;
      }
      // Assignment: callee = RHS / callee += RHS.
      if (
        after &&
        after.kind === "punct" &&
        (after.value === "=" || after.value === "+=")
      ) {
        const names = sc.propNames(chain);
        const rhs = chain.endTok + 1;
        const end = sc.rhsEnd(rhs);
        if (names.length > 0) {
          const prop = names[names.length - 1] as string | null;
          if (prop === "innerHTML" || prop === "outerHTML") {
            if (!rhsIsPureLiteral(sc, rhs, end)) {
              const close = toks[end - 1] as Tok | undefined;
              sc.flag(
                prop === "innerHTML" ? "inner-html" : "outer-html",
                chain.start,
                close ? close.end : after.end,
              );
            }
          }
          // a.b = <dangerous> does not create a local alias — skip.
        } else {
          sc.trackAssign(chain.root, rhs, end);
        }
        i = chain.endTok; // land on `=`/`+=`: the RHS (possibly a group)
        continue; // is walked next; nested calls still flag
      }
      i = chain.endTok;
      continue;
    }

    i += 1;
  }

  return sc.findings;
}

/**
 * `var|let|const …` — track a single declarator head (incl. object
 * destructuring from global sources), then return the index to continue
 * walking from so right-hand sides and later declarators are scanned.
 */
function scanDeclaration(sc: Scanner, from: number): number {
  const toks = sc.toks;
  const t = toks[from] as Tok | undefined;
  if (!t) return from;
  // Object destructuring: const { a, b: c } = SRC
  if (t.kind === "punct" && t.value === "{") {
    let j = from + 1;
    const names: { prop: string; local: string }[] = [];
    let depth = 1;
    for (; j < toks.length && depth > 0; j += 1) {
      const u = toks[j] as Tok;
      if (u.kind === "punct" && u.value === "{") depth += 1;
      else if (u.kind === "punct" && u.value === "}") {
        depth -= 1;
        if (depth === 0) break;
      } else if (depth === 1 && u.kind === "ident") {
        const colon = toks[j + 1] as Tok | undefined;
        if (colon && colon.kind === "punct" && colon.value === ":") {
          const local = toks[j + 2] as Tok | undefined;
          if (local && local.kind === "ident") {
            names.push({ prop: u.value, local: local.value });
            j += 2;
          }
        } else {
          names.push({ prop: u.value, local: u.value });
        }
      }
    }
    const eq = toks[j + 1] as Tok | undefined;
    if (eq && eq.kind === "punct" && eq.value === "=") {
      const srcKind = sc.resolveValue(j + 2);
      const srcTok = toks[j + 2] as Tok | undefined;
      const isGlobalSrc =
        srcKind === "global" ||
        (srcTok?.kind === "ident" && WINDOW_ROOTS.has(srcTok.value));
      for (const { prop, local } of names) {
        if (isGlobalSrc || srcKind === "document" || srcKind === "Reflect") {
          if (
            prop === "eval" ||
            prop === "Function" ||
            prop === "setTimeout" ||
            prop === "setInterval"
          ) {
            sc.alias.set(local, prop as AliasKind);
            continue;
          }
          if (prop === "document" && srcKind === "global") {
            sc.alias.set(local, "document");
            continue;
          }
          if (prop === "Reflect" && srcKind === "global") {
            sc.alias.set(local, "Reflect");
            continue;
          }
        }
        sc.alias.delete(local);
      }
    }
    return from; // walk the pattern, `=`, and source normally
  }
  if (t.kind === "ident") {
    const eq = toks[from + 1] as Tok | undefined;
    if (eq && eq.kind === "punct" && eq.value === "=") {
      const end = sc.rhsEnd(from + 2);
      sc.trackAssign(t.value, from + 2, end);
      return from + 2; // walk the RHS; nested calls still flag
    }
    return from + 1; // uninitialised declarator
  }
  return from;
}

/** RHS is exactly one string literal or substitution-free template. */
function rhsIsPureLiteral(sc: Scanner, from: number, to: number): boolean {
  if (to - from !== 1) return false;
  const t = sc.tok(from);
  if (!t) return false;
  if (t.kind === "string") return true;
  return t.kind === "template" && !t.dynamic;
}

/* ------------------------------------------------------------------ exports */

/** Tokenize + walk, recursing into template `${…}` interiors (depth-capped). */
function runScan(src: string, base = 0, depth = 0): RawFinding[] {
  const { toks } = tokenize(src);
  const out = walk(src, toks).map((f) => ({
    rule: f.rule,
    start: f.start + base,
    end: f.end + base,
  }));
  if (depth < 10) {
    for (const t of toks) {
      if (t.kind === "template" && t.dynamic) {
        for (const s of t.subs) {
          for (const f of runScan(
            src.slice(s.start, s.end),
            base + s.start,
            depth + 1,
          )) {
            if (out.length < 50) out.push(f);
          }
        }
      }
    }
  }
  return out;
}

function toResult(src: string, raw: RawFinding[]): JsScanResult {
  return {
    ok: raw.length === 0,
    findings: raw.map((f) => ({
      rule: f.rule,
      excerpt: excerptOf(src, f.start, f.end),
    })),
  };
}

/**
 * AST-only deep check (no regex pre-pass). The gates call this as their
 * second stage after their own regex test, so a rejection here reuses the
 * gate's existing `dynamic_code` failure code.
 */
export function scanJsAst(source: string): JsScanResult {
  if (typeof source !== "string") return { ok: true, findings: [] };
  return toResult(source, runScan(source));
}

/**
 * Full entry scan: regex pre-pass with the gate's own pattern (imported, not
 * duplicated) for the given domain, then the AST deep check. The pre-pass
 * runs on the masked source — string literals, template bodies, regex
 * literals and comments are blanked (offsets preserved) — so prose that
 * merely mentions `eval(` never trips it, while every code-shape match the
 * gates rely on is preserved. Findings from both stages are combined.
 */
export function scanJsEntry(
  source: string,
  domain: JsScanDomain = "manifest",
): JsScanResult {
  if (typeof source !== "string") return { ok: true, findings: [] };
  const re =
    domain === "bundle"
      ? BUNDLE_ENTRY_DYNAMIC_CODE_RE
      : MANIFEST_ENTRY_DYNAMIC_CODE_RE;
  const findings: JsFinding[] = [];
  const masked = tokenize(source).masked;
  const m = re.exec(masked);
  if (m && m[0]) {
    const at = m.index >= 0 ? m.index : 0;
    findings.push({
      rule: "regex-prepass",
      excerpt: excerptOf(source, at, at + m[0].length),
    });
  }
  for (const f of scanJsAst(source).findings) findings.push(f);
  return { ok: findings.length === 0, findings };
}
