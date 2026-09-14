/**
 * Phase 10.8 — dependency-free syntax highlighting.
 *
 * A docs site is the worst place to ship 40 kB of highlighter: it is a
 * read-mostly surface with a hard LCP budget in `web-vitals.ts`, and the pages
 * are pre-rendered. So instead of pulling in Shiki/Prism we tokenise the four
 * languages the reference actually uses (bash, ts, json, http) with a single
 * ordered regex pass and emit semantic spans the theme colours through tokens.
 *
 * Rules that keep this honest rather than clever:
 *  - the tokeniser NEVER emits HTML; it returns `{ kind, text }` pairs and React
 *    escapes them. There is no `dangerouslySetInnerHTML` anywhere in the docs
 *    pipeline, so a code sample can never inject markup;
 *  - unknown languages fall through to a single `plain` token, which renders
 *    correctly rather than mangled;
 *  - the pass is linear and bounded: one `lastIndex`-driven walk, no
 *    backtracking-heavy alternations, and input is length-capped by the caller.
 *
 * Pure and isomorphic: used by SSR and by the client-side "copy" affordance.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "punctuation"
  | "property"
  | "method"
  | "variable";

export type Token = { kind: TokenKind; text: string };

export type CodeLang = "bash" | "ts" | "json" | "http" | "text";

const TS_KEYWORDS = new Set([
  "const","let","var","function","return","await","async","import","from","export","default",
  "if","else","for","of","in","while","try","catch","finally","throw","new","class","extends",
  "type","interface","true","false","null","undefined","as","void","this",
]);

const BASH_KEYWORDS = new Set([
  "curl","echo","export","jq","if","then","fi","for","do","done","set","cat","printf",
]);

const HTTP_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"]);

/** Hard ceiling so a pathological sample cannot spend SSR time. */
const MAX_INPUT = 20_000;

type Rule = { kind: TokenKind; re: RegExp };

const RULES: Record<CodeLang, Rule[]> = {
  text: [],
  bash: [
    { kind: "comment", re: /#[^\n]*/y },
    { kind: "string", re: /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/y },
    { kind: "variable", re: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/y },
    { kind: "punctuation", re: /--?[A-Za-z][A-Za-z0-9-]*/y },
    { kind: "number", re: /\b\d+(?:\.\d+)?\b/y },
    { kind: "keyword", re: /\b[A-Za-z_][A-Za-z0-9_-]*\b/y },
  ],
  ts: [
    { kind: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { kind: "string", re: /`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/y },
    { kind: "number", re: /\b\d+(?:\.\d+)?\b/y },
    { kind: "method", re: /\b[A-Za-z_$][\w$]*(?=\s*\()/y },
    { kind: "keyword", re: /\b[A-Za-z_$][\w$]*\b/y },
    { kind: "punctuation", re: /[{}[\]();,.:=<>+\-*/!?&|]/y },
  ],
  json: [
    { kind: "property", re: /"(?:[^"\\]|\\.)*"(?=\s*:)/y },
    { kind: "string", re: /"(?:[^"\\]|\\.)*"/y },
    { kind: "number", re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
    { kind: "keyword", re: /\b(?:true|false|null)\b/y },
    { kind: "punctuation", re: /[{}[\],:]/y },
  ],
  http: [
    { kind: "comment", re: /#[^\n]*/y },
    { kind: "method", re: /\b(?:GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/y },
    { kind: "property", re: /^[A-Za-z][A-Za-z0-9-]*(?=:)/my },
    { kind: "number", re: /\b\d+\b/y },
    { kind: "string", re: /"(?:[^"\\]|\\.)*"/y },
  ],
};

/**
 * Tokenise `code` for `lang`. Always returns tokens whose concatenated `text`
 * is byte-identical to the (clamped) input — the contract test asserts this,
 * because a highlighter that drops a character silently corrupts a code sample
 * a reader is about to paste into a terminal.
 */
export function highlight(code: string, lang: CodeLang = "text"): Token[] {
  const source = code.length > MAX_INPUT ? code.slice(0, MAX_INPUT) : code;
  const rules = RULES[lang] ?? [];
  if (rules.length === 0) return source ? [{ kind: "plain", text: source }] : [];

  const out: Token[] = [];
  let index = 0;
  let pending = "";

  const flush = () => {
    if (pending) {
      out.push({ kind: "plain", text: pending });
      pending = "";
    }
  };

  while (index < source.length) {
    let matched: Token | null = null;
    for (const rule of rules) {
      rule.re.lastIndex = index;
      const hit = rule.re.exec(source);
      if (hit && hit.index === index && hit[0].length > 0) {
        matched = { kind: refine(rule.kind, hit[0], lang), text: hit[0] };
        break;
      }
    }
    if (!matched) {
      pending += source[index] as string;
      index += 1;
      continue;
    }
    flush();
    out.push(matched);
    index += matched.text.length;
  }
  flush();
  return merge(out);
}

/** Word rules match every identifier; only reserved words stay keywords. */
function refine(kind: TokenKind, text: string, lang: CodeLang): TokenKind {
  if (kind !== "keyword") return kind;
  if (lang === "ts") return TS_KEYWORDS.has(text) ? "keyword" : "plain";
  if (lang === "bash") {
    if (BASH_KEYWORDS.has(text)) return "keyword";
    return HTTP_METHODS.has(text) ? "method" : "plain";
  }
  return kind;
}

/** Adjacent same-kind tokens become one span; fewer DOM nodes, same output. */
function merge(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === token.kind) last.text += token.text;
    else out.push({ ...token });
  }
  return out;
}

/** Tailwind classes per token kind — all semantic tokens, no raw hex. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-muted-foreground italic",
  string: "text-success",
  number: "text-warning",
  keyword: "text-primary font-medium",
  punctuation: "text-muted-foreground",
  property: "text-info",
  method: "text-primary",
  variable: "text-warning",
};
