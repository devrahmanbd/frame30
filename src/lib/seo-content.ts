/**
 * Document facts for SEO analysis (Phase 2) — pure, client-safe, allocation-lean.
 *
 * The analyser must not care whether the body arrived as Classic-Editor HTML,
 * markdown-ish page copy or a plain product description; it needs the same
 * handful of facts either way: readable text, headings in document order,
 * images and their alt text, links split into internal / external, and the
 * first paragraph a reader actually sees.
 *
 * Everything here is a linear scan over the source with bounded work: a 5k-word
 * body is parsed in a couple of milliseconds, which is what keeps the Web
 * Worker inside its 50 ms budget while the merchant types.
 *
 * No DOM. `DOMParser` exists in the browser but not in the worker-safe server
 * path, and the two must agree on every number, so we tokenise ourselves.
 */

export type DocHeading = { level: number; text: string };
export type DocImage = { src: string; alt: string; hasDimensions: boolean };
export type DocLink = { href: string; text: string; internal: boolean; nofollow: boolean };

export type DocumentFacts = {
  /** Tag-free, entity-decoded, whitespace-collapsed body copy. */
  text: string;
  words: number;
  paragraphs: string[];
  firstParagraph: string;
  sentences: string[];
  headings: DocHeading[];
  headingLevels: number[];
  images: DocImage[];
  links: DocLink[];
  internalLinks: number;
  externalLinks: number;
  /** True when the source looked like HTML rather than plain copy. */
  html: boolean;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS =
  /<\/?(?:p|div|section|article|header|footer|h[1-6]|ul|ol|li|blockquote|pre|table|tr|figure|figcaption|br|hr)\b[^>]*>/gi;

/** Strips markup and collapses whitespace, keeping block boundaries as breaks. */
export function toPlainText(source: string): string {
  return decodeEntities(
    source
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BLOCK_TAGS, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function attr(tag: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return "";
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
}

/** A link is internal when it stays on this site: root-relative or same-origin. */
export function isInternalHref(href: string, origin?: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^(?:mailto:|tel:|sms:|javascript:|data:)/i.test(value)) return false;
  if (value.startsWith("#")) return false;
  if (/^https?:\/\//i.test(value)) {
    if (!origin) return false;
    try {
      return new URL(value).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  }
  return value.startsWith("/") || !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/** Splits into sentences without a locale-aware segmenter (deterministic). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。৷।])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countWords(text: string): number {
  return text.split(/[\s\u200b]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Everything the analyser needs, extracted in one pass over the source. */
export function documentFacts(source: string, options: { origin?: string } = {}): DocumentFacts {
  const raw = typeof source === "string" ? source : "";
  const html = /<\/?[a-z][\s\S]*>/i.test(raw);

  const headings: DocHeading[] = [];
  const images: DocImage[] = [];
  const links: DocLink[] = [];

  if (html) {
    const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    for (let m = headingRe.exec(raw); m; m = headingRe.exec(raw)) {
      headings.push({ level: Number(m[1]), text: toPlainText(m[2] ?? "").replace(/\n/g, " ").trim() });
    }
    const imgRe = /<img\b[^>]*>/gi;
    for (let m = imgRe.exec(raw); m; m = imgRe.exec(raw)) {
      const tag = m[0];
      images.push({
        src: attr(tag, "src"),
        alt: attr(tag, "alt"),
        hasDimensions: Boolean(attr(tag, "width") && attr(tag, "height")),
      });
    }
    const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    for (let m = anchorRe.exec(raw); m; m = anchorRe.exec(raw)) {
      const attrs = m[1] ?? "";
      const href = attr(`<a ${attrs}>`, "href");
      if (!href) continue;
      links.push({
        href,
        text: toPlainText(m[2] ?? "").replace(/\n/g, " ").trim(),
        internal: isInternalHref(href, options.origin),
        nofollow: /nofollow/i.test(attr(`<a ${attrs}>`, "rel")),
      });
    }
  } else {
    // Markdown-ish fallback so page/product copy is analysed, not ignored.
    const mdHeading = /^(#{1,6})\s+(.+)$/gm;
    for (let m = mdHeading.exec(raw); m; m = mdHeading.exec(raw)) {
      headings.push({ level: (m[1] ?? "#").length, text: (m[2] ?? "").trim() });
    }
    const mdImage = /!\[([^\]]*)\]\(([^)\s]+)/g;
    for (let m = mdImage.exec(raw); m; m = mdImage.exec(raw)) {
      images.push({ src: m[2] ?? "", alt: (m[1] ?? "").trim(), hasDimensions: false });
    }
    const mdLink = /(^|[^!])\[([^\]]+)\]\(([^)\s]+)/g;
    for (let m = mdLink.exec(raw); m; m = mdLink.exec(raw)) {
      const href = m[3] ?? "";
      links.push({
        href,
        text: (m[2] ?? "").trim(),
        internal: isInternalHref(href, options.origin),
        nofollow: false,
      });
    }
  }

  const text = toPlainText(raw);
  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  const headingTexts = new Set(headings.map((h) => h.text).filter(Boolean));
  const bodyParagraphs = paragraphs.filter((p) => !headingTexts.has(p));

  return {
    text,
    words: countWords(text),
    paragraphs,
    firstParagraph: bodyParagraphs[0] ?? paragraphs[0] ?? "",
    sentences: splitSentences(text),
    headings,
    headingLevels: headings.map((h) => h.level),
    images,
    links,
    internalLinks: links.filter((l) => l.internal).length,
    externalLinks: links.filter((l) => !l.internal).length,
    html,
  };
}

/* ------------------------------- keywords --------------------------------- */

/** Case/diacritic-insensitive comparison surface used by every keyword check. */
export function normaliseText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Occurrences of a phrase, counted on token boundaries (not substrings). */
export function phraseOccurrences(haystack: string, phrase: string): number {
  const needle = normaliseText(phrase);
  if (!needle) return 0;
  const hay = ` ${normaliseText(haystack)} `;
  let index = 0;
  let count = 0;
  const probe = ` ${needle} `;
  for (;;) {
    const at = hay.indexOf(probe, index);
    if (at === -1) break;
    count += 1;
    index = at + probe.length - 1;
  }
  return count;
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  return phraseOccurrences(haystack, phrase) > 0;
}

/** Where in the title the keyword lands, as a 0–1 position (1 = not found). */
export function phrasePosition(haystack: string, phrase: string): number {
  const needle = normaliseText(phrase);
  const hay = normaliseText(haystack);
  if (!needle || !hay) return 1;
  const at = hay.indexOf(needle);
  if (at === -1) return 1;
  return hay.length === 0 ? 1 : at / hay.length;
}

/* ------------------------------ readability -------------------------------- */

const TRANSITIONS = [
  "because", "therefore", "however", "meanwhile", "in addition", "for example",
  "in short", "as a result", "on the other hand", "finally", "first", "second",
  "instead", "besides", "although", "so that", "in fact", "that is why",
];

const PASSIVE_AUX = /\b(?:is|are|was|were|been|being|be)\b\s+(?:\w+ly\s+)?(\w+(?:ed|en))\b/gi;

export type Readability = {
  /** Honest opt-out: বাংলা has no validated readability model here. */
  applicable: boolean;
  sentences: number;
  words: number;
  avgSentenceWords: number;
  longSentenceRatio: number;
  longParagraphRatio: number;
  passiveRatio: number;
  transitionRatio: number;
  /** Flesch reading ease, clamped to 0–100. */
  ease: number;
};

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:es|ed|e)$/g, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * English readability. For `bn` we return `applicable: false` rather than
 * running an English model over বাংলা and reporting a confident wrong number.
 */
export function readability(facts: DocumentFacts, locale: "en" | "bn"): Readability {
  const empty: Readability = {
    applicable: locale === "en",
    sentences: facts.sentences.length,
    words: facts.words,
    avgSentenceWords: 0,
    longSentenceRatio: 0,
    longParagraphRatio: 0,
    passiveRatio: 0,
    transitionRatio: 0,
    ease: 0,
  };
  if (locale !== "en" || facts.words === 0 || facts.sentences.length === 0) return empty;

  const sentenceWordCounts = facts.sentences.map((s) => countWords(s));
  const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0) || facts.words;
  const longSentences = sentenceWordCounts.filter((n) => n > 20).length;
  const longParagraphs = facts.paragraphs.filter((p) => countWords(p) > 150).length;

  const lower = facts.text.toLowerCase();
  const passiveHits = (facts.text.match(PASSIVE_AUX) ?? []).length;
  const transitionHits = facts.sentences.filter((s) => {
    const sl = s.toLowerCase();
    return TRANSITIONS.some((tr) => sl.includes(tr));
  }).length;
  void lower;

  const totalSyllables = facts.text
    .split(/\s+/)
    .reduce((sum, word) => sum + syllables(word), 0);
  const ease =
    206.835 -
    1.015 * (totalWords / facts.sentences.length) -
    84.6 * (totalSyllables / Math.max(1, totalWords));

  return {
    applicable: true,
    sentences: facts.sentences.length,
    words: facts.words,
    avgSentenceWords: totalWords / facts.sentences.length,
    longSentenceRatio: longSentences / facts.sentences.length,
    longParagraphRatio: facts.paragraphs.length ? longParagraphs / facts.paragraphs.length : 0,
    passiveRatio: passiveHits / facts.sentences.length,
    transitionRatio: transitionHits / facts.sentences.length,
    ease: Math.max(0, Math.min(100, Math.round(ease))),
  };
}
