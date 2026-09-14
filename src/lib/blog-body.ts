/**
 * Phase 1 — the article body document model.
 *
 * WordPress' Classic Editor has two tabs over one document: *Visual* and
 * *Text*. Both must be the same truth, or a writer loses work the moment they
 * switch. This module is that truth, and it is deliberately dependency-free and
 * DOM-free so the identical code runs in three places:
 *
 *   - the admin editor (both tabs, and the paste path),
 *   - a Web Worker (Phase 2 analysis, no DOM there),
 *   - the server (`cms.server.ts` sanitises and validates every save, because a
 *     client is never trusted with markup that ends up in a storefront page).
 *
 * Design decisions worth knowing before editing:
 *
 * 1. **Allow-list only.** Unknown tags are not "escaped and kept as markup" —
 *    they are unwrapped to their text. A body can therefore never carry a
 *    `<script>`, an `onerror=`, a `javascript:` href, or a styled div that
 *    breaks the theme. Sanitising on parse (not on render) means the stored row
 *    is already safe; a future renderer cannot forget to sanitise.
 * 2. **Canonical serialisation.** `serializeBody(parseBody(x))` is idempotent:
 *    parsing the output again yields an identical string. That property is what
 *    makes the Visual↔Text round-trip lossless, and it is asserted in the
 *    contract test for every supported mark.
 * 3. **Zero-CLS images.** An `<img>` without `width`, `height` and a non-empty
 *    `alt` is not a warning, it is a rejection (`validateBody`). Layout shift
 *    and missing alt text are the two article-body defects that are impossible
 *    to fix later at scale, so they are refused at write time.
 * 4. **Bounded.** Every loop has a ceiling and every input is length-capped.
 *    Parsers that recurse over hostile input are a denial-of-service surface,
 *    and this one runs on a request path.
 */

/* ------------------------------------------------------------------ limits */

export const BODY_LIMITS = {
  /** ~400 kB of markup: far past any real article, well short of a memory problem. */
  maxChars: 400_000,
  maxBlocks: 2_000,
  maxListItems: 500,
  maxTableRows: 200,
  maxTableCells: 20,
  /** Inline nesting past this is always hostile or machine-generated. */
  maxInlineDepth: 8,
  maxImageDimension: 10_000,
  maxHrefChars: 2_048,
  excerptChars: 200,
  /** Words per minute used for the reading-time estimate shown in the editor. */
  wordsPerMinute: 220,
} as const;

/* ------------------------------------------------------------------- model */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; c: Inline[] }
  | { t: "u"; c: Inline[] }
  | { t: "s"; c: Inline[] }
  | { t: "br" }
  | { t: "link"; href: string; c: Inline[] };

export type HeadingLevel = 2 | 3 | 4;

export type TextAlign = "left" | "center" | "right";

export type Block =
  | { type: "paragraph"; inline: Inline[]; align?: TextAlign }
  | { type: "heading"; level: HeadingLevel; inline: Inline[]; align?: TextAlign }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; inline: Inline[] }
  | { type: "code"; lang: string; code: string }
  | { type: "hr" }
  | { type: "image"; src: string; alt: string; width: number; height: number; caption: string }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "more" };

export type BlockType = Block["type"];

/** The label set the editor toolbar renders from, so the toolbar can never drift. */
export const BLOCK_LABEL: Record<BlockType, { en: string; bn: string }> = {
  paragraph: { en: "Paragraph", bn: "অনুচ্ছেদ" },
  heading: { en: "Heading", bn: "শিরোনাম" },
  list: { en: "List", bn: "তালিকা" },
  quote: { en: "Quote", bn: "উদ্ধৃতি" },
  code: { en: "Code", bn: "কোড" },
  hr: { en: "Divider", bn: "বিভাজক" },
  image: { en: "Image", bn: "ছবি" },
  table: { en: "Table", bn: "টেবিল" },
  more: { en: "Read-more split", bn: "আরও পড়ুন বিভাজন" },
};

/* --------------------------------------------------------------- utilities */

const NAMED_ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: "\u00a0",
};

/** Decode only the entities we emit, plus numeric ones; unknown names stay literal. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    const known = NAMED_ENTITY[name.toLowerCase()];
    if (known) return known;
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? safeCodePoint(code) : whole;
    }
    if (name.startsWith("#")) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? safeCodePoint(code) : whole;
    }
    return whole;
  });
}

function safeCodePoint(code: number): string {
  // Surrogate halves and control characters are never legitimate article text.
  if (code >= 0xd800 && code <= 0xdfff) return "";
  if (code < 0x20 && code !== 0x09 && code !== 0x0a) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * URL policy for hrefs and image sources.
 *
 * Everything that is not an obviously safe scheme, a same-origin path, or a
 * fragment is dropped. Returning `null` (rather than throwing) lets the parser
 * degrade a poisoned link to plain text instead of losing the sentence.
 */
export function safeUrl(raw: string): string | null {
  const value = decodeEntities(raw).trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!value || value.length > BODY_LIMITS.maxHrefChars) return null;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) return value;
  // A bare "example.com/post" is a merchant typo, not an attack: make it https.
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return `https://${value}`;
  return null;
}

function collapse(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ");
}

/* ------------------------------------------------------------ inline parse */

type Tag = { name: string; attrs: Record<string, string>; selfClosing: boolean; closing: boolean };

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function parseTag(source: string): Tag | null {
  const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)(\/?)>$/.exec(source);
  if (!match) return null;
  const attrs: Record<string, string> = {};
  const rest = match[3] ?? "";
  ATTR_RE.lastIndex = 0;
  let attr: RegExpExecArray | null;
  let guard = 0;
  while ((attr = ATTR_RE.exec(rest)) && guard++ < 64) {
    const key = (attr[1] ?? "").toLowerCase();
    const value = (attr[2] ?? "").replace(/^["']|["']$/g, "");
    attrs[key] = decodeEntities(value);
  }
  return {
    name: (match[2] ?? "").toLowerCase(),
    attrs,
    selfClosing: match[4] === "/",
    closing: match[1] === "/",
  };
}

/** Splits a markup string into tags and text runs without building a DOM. */
function lex(source: string): ({ kind: "text"; value: string } | { kind: "tag"; tag: Tag })[] {
  const out: ({ kind: "text"; value: string } | { kind: "tag"; tag: Tag })[] = [];
  let index = 0;
  let guard = 0;
  while (index < source.length && guard++ < 100_000) {
    const next = source.indexOf("<", index);
    if (next < 0) {
      out.push({ kind: "text", value: source.slice(index) });
      break;
    }
    if (next > index) out.push({ kind: "text", value: source.slice(index, next) });
    const close = source.indexOf(">", next);
    if (close < 0) {
      out.push({ kind: "text", value: source.slice(next) });
      break;
    }
    const raw = source.slice(next, close + 1);
    const tag = parseTag(raw);
    if (tag) out.push({ kind: "tag", tag });
    // An unparseable `<...>` run is dropped: it is never meaningful article text.
    index = close + 1;
  }
  return out;
}

const INLINE_ALIAS: Record<string, "strong" | "em" | "code" | "u" | "s"> = {
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  code: "code",
  u: "u",
  ins: "u",
  s: "s",
  del: "s",
  strike: "s",
};

/** Reads a block's alignment from either the WordPress class or an inline style. */
function alignOf(openTag: string): TextAlign | undefined {
  const match = /(?:has-text-align-|text-align\s*:\s*)(left|center|right)/i.exec(openTag);
  const value = match?.[1]?.toLowerCase() as TextAlign | undefined;
  return value && value !== "left" ? value : undefined;
}

function alignAttr(align: TextAlign | undefined): string {
  return align && align !== "left" ? ` class="has-text-align-${align}"` : "";
}

/**
 * Parse an inline markup run into the model.
 *
 * Unknown tags are *unwrapped* (their children survive, the tag does not), so
 * pasting from Word or Google Docs keeps the sentence and loses the noise.
 */
export function parseInline(source: string, depth = 0): Inline[] {
  if (depth > BODY_LIMITS.maxInlineDepth) return [{ t: "text", v: stripTags(source) }];
  const tokens = lex(source);
  const out: Inline[] = [];
  let index = 0;

  const push = (node: Inline) => {
    const last = out[out.length - 1];
    if (node.t === "text" && last && last.t === "text") last.v += node.v;
    else out.push(node);
  };

  while (index < tokens.length) {
    const token = tokens[index]!;
    index += 1;
    if (token.kind === "text") {
      const text = decodeEntities(token.value);
      if (text) push({ t: "text", v: text });
      continue;
    }
    const { tag } = token;
    if (tag.closing) continue; // stray close tag: ignore
    if (tag.name === "br") {
      push({ t: "br" });
      continue;
    }
    if (tag.name === "img") {
      // Inline images are lifted to their own block by the block parser; here
      // (inside a heading, say) the alt text is the only meaningful content.
      const alt = (tag.attrs["alt"] ?? "").trim();
      if (alt) push({ t: "text", v: alt });
      continue;
    }

    const inner = tag.selfClosing
      ? { raw: "", nextIndex: index }
      : takeUntilClose(tokens, index, tag.name);
    index = inner.nextIndex;
    const children = inner.raw ? parseInline(inner.raw, depth + 1) : [];

    const alias = INLINE_ALIAS[tag.name];
    if (alias) {
      if (children.length) push({ t: alias, c: children });
      continue;
    }
    if (tag.name === "a") {
      const href = safeUrl(tag.attrs["href"] ?? "");
      if (href && children.length) push({ t: "link", href, c: children });
      else for (const child of children) push(child);
      continue;
    }
    // Unknown tag: unwrap.
    for (const child of children) push(child);
  }

  return normaliseInline(out);
}

/** Re-serialises the token slice between here and the matching close tag. */
function takeUntilClose(
  tokens: ReturnType<typeof lex>,
  start: number,
  name: string,
): { raw: string; nextIndex: number } {
  let depth = 1;
  let raw = "";
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index]!;
    index += 1;
    if (token.kind === "text") {
      raw += token.value;
      continue;
    }
    const { tag } = token;
    if (tag.name === name && !tag.selfClosing) {
      depth += tag.closing ? -1 : 1;
      if (depth === 0) return { raw, nextIndex: index };
    }
    raw += reserialize(tag);
  }
  // Unclosed tag: treat the remainder as its content rather than dropping it.
  return { raw, nextIndex: index };
}

function reserialize(tag: Tag): string {
  const attrs = Object.entries(tag.attrs)
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join("");
  return `<${tag.closing ? "/" : ""}${tag.name}${attrs}${tag.selfClosing ? " /" : ""}>`;
}

function stripTags(source: string): string {
  return decodeEntities(source.replace(/<[^>]*>/g, ""));
}

/** Drops empties and merges adjacent text so serialisation is canonical. */
function normaliseInline(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.t === "text") {
      if (!node.v) continue;
      const last = out[out.length - 1];
      if (last && last.t === "text") last.v += node.v;
      else out.push({ t: "text", v: node.v });
      continue;
    }
    if (node.t === "br") {
      out.push(node);
      continue;
    }
    if (node.t === "link") {
      const children = normaliseInline(node.c);
      if (children.length) out.push({ ...node, c: children });
      continue;
    }
    const children = normaliseInline(node.c);
    if (children.length) out.push({ ...node, c: children });
  }
  // Trim the outer edges so `<p> text </p>` and `<p>text</p>` agree.
  const first = out[0];
  if (first && first.t === "text") first.v = first.v.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v = last.v.replace(/\s+$/, "");
  return out.filter((node) => node.t !== "text" || node.v !== "");
}

export function inlineToHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case "text":
          return escapeHtml(node.v);
        case "br":
          return "<br />";
        case "link":
          return `<a href="${escapeHtml(node.href)}">${inlineToHtml(node.c)}</a>`;
        default:
          return `<${node.t}>${inlineToHtml(node.c)}</${node.t}>`;
      }
    })
    .join("");
}

export function inlineToText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.t === "text") return node.v;
      if (node.t === "br") return " ";
      return inlineToText(node.c);
    })
    .join("");
}

/* ------------------------------------------------------------- block parse */

/**
 * Void tags (`img`, `hr`) are matched separately from containers on purpose.
 * A single alternation ending in `(?:\/>|<\/\1>)` terminates a `<figure>` at
 * the first self-closing `<img ... />` inside it, which silently orphans the
 * `<figcaption>` and breaks parse→serialize idempotence.
 */
const BLOCK_RE =
  /<!--\s*more\s*-->|<(?:img|hr)\b[^>]*?\/?>|<(h[234]|p|ul|ol|blockquote|pre|figure|table|div|section)\b[\s\S]*?<\/\1\s*>/gi;

function toDimension(raw: string | undefined): number {
  const value = Number.parseInt((raw ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, BODY_LIMITS.maxImageDimension);
}

function innerOf(source: string, name: string): string {
  const match = new RegExp(`^<${name}\\b[^>]*>([\\s\\S]*)</${name}\\s*>$`, "i").exec(source.trim());
  return match?.[1] ?? "";
}

function imageBlockFrom(source: string, caption: string): Block | null {
  const imgMatch = /<img\b[^>]*>/i.exec(source);
  if (!imgMatch) return null;
  const tag = parseTag(imgMatch[0].endsWith("/>") ? imgMatch[0] : imgMatch[0].replace(/>$/, "/>"));
  if (!tag) return null;
  const src = safeUrl(tag.attrs["src"] ?? "");
  if (!src) return null;
  return {
    type: "image",
    src,
    alt: collapse(decodeEntities(tag.attrs["alt"] ?? "")).trim(),
    width: toDimension(tag.attrs["width"]),
    height: toDimension(tag.attrs["height"]),
    caption: collapse(caption).trim(),
  };
}

function listBlock(source: string, ordered: boolean): Block | null {
  const inner = innerOf(source, ordered ? "ol" : "ul");
  const items: Inline[][] = [];
  const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(inner)) && items.length < BODY_LIMITS.maxListItems) {
    const inline = parseInline(match[1] ?? "");
    if (inline.length) items.push(inline);
  }
  if (!items.length) return null;
  return { type: "list", ordered, items };
}

function tableBlock(source: string): Block | null {
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  const rows: { header: boolean; cells: Inline[][] }[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(source)) && rows.length < BODY_LIMITS.maxTableRows) {
    const rowSource = match[1] ?? "";
    const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    const cells: Inline[][] = [];
    let header = false;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(rowSource)) && cells.length < BODY_LIMITS.maxTableCells) {
      if ((cell[1] ?? "").toLowerCase() === "th") header = true;
      cells.push(parseInline(cell[2] ?? ""));
    }
    if (cells.length) rows.push({ header, cells });
  }
  if (!rows.length) return null;
  const head = rows[0]!.header ? rows.shift()!.cells : [];
  return { type: "table", head, rows: rows.map((row) => row.cells) };
}

/**
 * Parse a stored body into blocks.
 *
 * Legacy rows are plain text with blank-line paragraphs (that is what the blog
 * shipped with), so anything outside a recognised block tag is treated exactly
 * that way. Existing articles therefore upgrade in place with no migration.
 */
export function parseBody(raw: string): Block[] {
  const source = (raw ?? "").slice(0, BODY_LIMITS.maxChars);
  if (!source.trim()) return [];
  const blocks: Block[] = [];
  let cursor = 0;

  const flushPlain = (text: string) => {
    for (const chunk of text.split(/\n{2,}/)) {
      if (blocks.length >= BODY_LIMITS.maxBlocks) return;
      // Whitespace between serialized blocks is layout, not content.
      if (!chunk.trim()) continue;
      const inline = parseInline(chunk.replace(/\n/g, "<br />"));
      if (inline.length) blocks.push({ type: "paragraph", inline });
    }
  };

  BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_RE.exec(source)) && blocks.length < BODY_LIMITS.maxBlocks) {
    if (match.index > cursor) flushPlain(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const chunk = match[0];
    const name = (match[1] ?? /^<\s*([a-z0-9]+)/i.exec(chunk)?.[1] ?? "").toLowerCase();

    if (/^<!--/.test(chunk)) {
      blocks.push({ type: "more" });
      continue;
    }
    switch (name) {
      case "h2":
      case "h3":
      case "h4": {
        const inline = parseInline(innerOf(chunk, name));
        if (inline.length) {
          const align = alignOf(chunk.slice(0, chunk.indexOf(">") + 1));
          blocks.push({ type: "heading", level: Number(name.slice(1)) as HeadingLevel, inline, ...(align ? { align } : {}) });
        }
        break;
      }
      case "p": {
        const inline = parseInline(innerOf(chunk, "p"));
        if (inline.length) {
          const align = alignOf(chunk.slice(0, chunk.indexOf(">") + 1));
          blocks.push({ type: "paragraph", inline, ...(align ? { align } : {}) });
        }
        break;
      }
      case "ul":
      case "ol": {
        const block = listBlock(chunk, name === "ol");
        if (block) blocks.push(block);
        break;
      }
      case "blockquote": {
        const inline = parseInline(innerOf(chunk, "blockquote").replace(/<\/?p\b[^>]*>/gi, " "));
        if (inline.length) blocks.push({ type: "quote", inline });
        break;
      }
      case "pre": {
        const inner = innerOf(chunk, "pre");
        const codeMatch = /<code\b([^>]*)>([\s\S]*?)<\/code\s*>/i.exec(inner);
        const langMatch = /class\s*=\s*["']?language-([a-z0-9+#-]{1,20})/i.exec(codeMatch?.[1] ?? "");
        const code = decodeEntities((codeMatch?.[2] ?? inner).replace(/<[^>]*>/g, ""));
        if (code.trim()) blocks.push({ type: "code", lang: langMatch?.[1]?.toLowerCase() ?? "", code });
        break;
      }
      case "hr":
        blocks.push({ type: "hr" });
        break;
      case "img": {
        const block = imageBlockFrom(chunk, "");
        if (block) blocks.push(block);
        break;
      }
      case "figure": {
        const caption = stripTags(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/i.exec(chunk)?.[1] ?? "");
        const block = imageBlockFrom(chunk, caption);
        if (block) blocks.push(block);
        break;
      }
      case "table": {
        const block = tableBlock(chunk);
        if (block) blocks.push(block);
        break;
      }
      default: {
        // div/section wrappers from a paste: keep the content, drop the box.
        const inner = innerOf(chunk, name);
        if (inner.trim()) {
          for (const nested of parseBody(inner)) {
            if (blocks.length < BODY_LIMITS.maxBlocks) blocks.push(nested);
          }
        }
        break;
      }
    }
  }
  if (cursor < source.length) flushPlain(source.slice(cursor));
  return blocks;
}

/* --------------------------------------------------------- serialisation */

export function blockToHtml(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return `<p${alignAttr(block.align)}>${inlineToHtml(block.inline)}</p>`;
    case "heading":
      return `<h${block.level}${alignAttr(block.align)}>${inlineToHtml(block.inline)}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote><p>${inlineToHtml(block.inline)}</p></blockquote>`;
    case "code": {
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      return `<pre><code${cls}>${escapeHtml(block.code)}</code></pre>`;
    }
    case "hr":
      return "<hr />";
    case "image": {
      const img =
        `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}"` +
        ` width="${block.width}" height="${block.height}" loading="lazy" decoding="async" />`;
      const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
      return `<figure>${img}${caption}</figure>`;
    }
    case "table": {
      const head = block.head.length
        ? `<thead><tr>${block.head.map((cell) => `<th>${inlineToHtml(cell)}</th>`).join("")}</tr></thead>`
        : "";
      const body = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineToHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<table>${head}<tbody>${body}</tbody></table>`;
    }
    case "more":
      return "<!--more-->";
  }
}

export function serializeBody(blocks: Block[]): string {
  return blocks.map(blockToHtml).join("\n\n");
}

/** Parse + re-serialise: the single call every write path uses to sanitise. */
export function normalizeBody(raw: string): string {
  return serializeBody(parseBody(raw));
}

/* ------------------------------------------------------------- validation */

export type BodyIssue = { code: string; en: string; bn: string; blockIndex: number };

/**
 * Hard rules. Anything returned here blocks the save — these are the defects a
 * merchant cannot repair after a thousand posts exist.
 */
export function validateBody(blocks: Block[]): BodyIssue[] {
  const issues: BodyIssue[] = [];
  let moreSeen = 0;
  blocks.forEach((block, blockIndex) => {
    if (block.type === "more") {
      moreSeen += 1;
      if (moreSeen > 1) {
        issues.push({
          code: "more_duplicate",
          en: "Only one read-more split is allowed.",
          bn: "শুধু একটি “আরও পড়ুন” বিভাজন রাখা যাবে।",
          blockIndex,
        });
      }
      return;
    }
    if (block.type !== "image") return;
    if (!block.alt) {
      issues.push({
        code: "image_alt_missing",
        en: "Every image needs alt text.",
        bn: "প্রতিটি ছবির জন্য বিকল্প লেখা দরকার।",
        blockIndex,
      });
    }
    if (!block.width || !block.height) {
      issues.push({
        code: "image_dimensions_missing",
        en: "Image needs width and height so the page does not jump.",
        bn: "পেজ লাফানো ঠেকাতে ছবির প্রস্থ ও উচ্চতা দরকার।",
        blockIndex,
      });
    }
  });
  return issues;
}

/* ------------------------------------------------------- excerpt + stats */

/** `<!--more-->` semantics: everything above the marker is the teaser. */
export function splitAtMore(blocks: Block[]): { teaser: Block[]; rest: Block[]; explicit: boolean } {
  const index = blocks.findIndex((block) => block.type === "more");
  if (index < 0) return { teaser: blocks, rest: [], explicit: false };
  return { teaser: blocks.slice(0, index), rest: blocks.slice(index + 1), explicit: true };
}

export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
        case "quote":
          return inlineToText(block.inline);
        case "list":
          return block.items.map(inlineToText).join(" ");
        case "code":
          return block.code;
        case "image":
          return block.caption;
        case "table":
          return [...block.head, ...block.rows.flat()].map(inlineToText).join(" ");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Derive the listing excerpt. An explicit `<!--more-->` wins; otherwise the
 * first paragraphs are trimmed on a word boundary so the card never ends
 * mid-word (the thing that makes auto-excerpts look broken).
 */
export function deriveExcerpt(blocks: Block[], limit = BODY_LIMITS.excerptChars): string {
  const { teaser, explicit } = splitAtMore(blocks);
  const source = explicit ? teaser : blocks.filter((block) => block.type === "paragraph");
  const text = collapse(blocksToText(source)).replace(/\n+/g, " ").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export type BodyStats = {
  words: number;
  characters: number;
  blocks: number;
  images: number;
  links: number;
  headings: number;
  readingMinutes: number;
};

export function bodyStats(blocks: Block[]): BodyStats {
  const text = blocksToText(blocks);
  const words = text.split(/\s+/).filter(Boolean).length;
  let links = 0;
  const countLinks = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.t === "link") {
        links += 1;
        countLinks(node.c);
      } else if (node.t !== "text" && node.t !== "br") countLinks(node.c);
    }
  };
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") countLinks(block.inline);
    if (block.type === "list") block.items.forEach(countLinks);
    if (block.type === "table") [...block.head, ...block.rows.flat()].forEach(countLinks);
  }
  return {
    words,
    characters: text.length,
    blocks: blocks.length,
    images: blocks.filter((block) => block.type === "image").length,
    links,
    headings: blocks.filter((block) => block.type === "heading").length,
    readingMinutes: Math.max(1, Math.round(words / BODY_LIMITS.wordsPerMinute)),
  };
}

/* ---------------------------------------------------------- editor helpers */

export function emptyBlock(type: BlockType): Block {
  switch (type) {
    case "heading":
      return { type: "heading", level: 2, inline: [] };
    case "list":
      return { type: "list", ordered: false, items: [[]] };
    case "quote":
      return { type: "quote", inline: [] };
    case "code":
      return { type: "code", lang: "", code: "" };
    case "hr":
      return { type: "hr" };
    case "image":
      return { type: "image", src: "", alt: "", width: 0, height: 0, caption: "" };
    case "table":
      return { type: "table", head: [[], []], rows: [[[], []]] };
    case "more":
      return { type: "more" };
    default:
      return { type: "paragraph", inline: [] };
  }
}

/** Editable HTML for one block's contenteditable surface (inline marks only). */
export function blockEditableHtml(block: Block): string {
  if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
    return inlineToHtml(block.inline);
  }
  return "";
}

/** Read a contenteditable back into the model, sanitising on the way in. */
export function blockFromEditableHtml(block: Block, html: string): Block {
  const inline = parseInline(html);
  if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
    return { ...block, inline };
  }
  return block;
}
