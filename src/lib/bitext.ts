/**
 * Phase 1.1 — the bilingual text layer.
 *
 * A bilingual widget prop is stored as **two flat props**, `key` (English) and
 * `key_bn` (বাংলা), rather than a nested object. That keeps `PropValue` a
 * scalar union, keeps every stored AST from before this phase valid without a
 * migration, and lets the breakpoint/override machinery keep working unchanged.
 *
 * This module is pure and imports nothing, so the parser, the renderer, the
 * inspector and server-side lint can all share it.
 */

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];

/** Suffix that carries the বাংলা side of a bilingual prop. */
export const BN_SUFFIX = "_bn";

/** Storage key for the বাংলা side of `key`. */
export function bnKey(key: string): string {
  return `${key}${BN_SUFFIX}`;
}

/** True when a prop key holds the বাংলা side of a bilingual pair. */
export function isBnKey(key: string): boolean {
  return key.endsWith(BN_SUFFIX);
}

export type BiText = { en: string; bn: string };

export function readBiText(props: Record<string, unknown>, key: string): BiText {
  const en = props[key];
  const bn = props[bnKey(key)];
  return {
    en: typeof en === "string" ? en : "",
    bn: typeof bn === "string" ? bn : "",
  };
}

/**
 * The string to render. বাংলা falls back to English (flagged, never blank);
 * English never falls back to বাংলা, because an English page must not
 * silently switch script.
 */
export function resolveBiText(value: BiText, locale: Locale): string {
  if (locale === "bn") return value.bn.trim() ? value.bn : value.en;
  return value.en;
}

/** Convenience: read + resolve in one call, straight off a props bag. */
export function textOf(props: Record<string, unknown>, key: string, locale: Locale): string {
  return resolveBiText(readBiText(props, key), locale);
}

export type BiTextState = "ok" | "fallback" | "empty";

/**
 * Translation completeness for one pair. `empty` is publish-blocking (there is
 * no copy at all); `fallback` is a warning (বাংলা shoppers see English).
 */
export function biTextState(value: BiText): BiTextState {
  if (!value.en.trim() && !value.bn.trim()) return "empty";
  if (!value.bn.trim()) return "fallback";
  return "ok";
}

/* --------------------------------------------------------------- numerals */

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Digit system used for numerals inside a locale. Theme-token controlled. */
export type DigitSystem = "latin" | "bengali";

/** Maps ASCII digits in a formatted string to the requested digit system. */
export function toDigits(value: string, system: DigitSystem): string {
  if (system === "latin") return value;
  return value.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]!);
}

/* ------------------------------------------------- fail-safe rendering */

/**
 * Phase 2.6 — missing-translation fail-safe. A বাংলা page that has no বাংলা
 * copy renders the English string *with an English `lang`*, so screen readers
 * and font selection stay correct; it never renders an empty node.
 */
export type TaggedText = { text: string; lang: Locale; state: BiTextState };

export function resolveBiTextTagged(value: BiText, locale: Locale): TaggedText {
  const state = biTextState(value);
  if (state === "empty") return { text: "", lang: locale, state };
  if (locale === "bn" && state === "fallback") return { text: value.en, lang: "en", state };
  return { text: locale === "bn" ? value.bn : value.en, lang: locale, state };
}

export function taggedTextOf(
  props: Record<string, unknown>,
  key: string,
  locale: Locale,
): TaggedText {
  return resolveBiTextTagged(readBiText(props, key), locale);
}

/* ------------------------------------------------- mixed-script safety */

/**
 * Phase 2.4 — SKUs, model numbers and units embedded in বাংলা copy must be
 * rendered LTR with `lang="en"`, otherwise bidi reordering mangles strings
 * like `A50-256GB` next to Bengali text.
 */
export type ScriptRun = { text: string; ltr: boolean };

/** Latin letters/digits plus the punctuation that binds a model number. */
const LATIN_RUN = /[A-Za-z0-9]+(?:[-_/.+±×'"°%][A-Za-z0-9]+)*(?:\s?(?:mm|cm|kg|g|ml|l|GB|TB|MB|Hz|W|V|mAh|px))?/g;
const BENGALI = /[\u0980-\u09FF]/;

/**
 * Splits text into runs. Only splits when the string actually mixes scripts —
 * pure English copy stays a single run so English pages get no extra markup.
 */
export function segmentMixedScript(text: string): ScriptRun[] {
  if (!text || !BENGALI.test(text)) return text ? [{ text, ltr: false }] : [];
  const runs: ScriptRun[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const start = m.index ?? 0;
    if (start > last) runs.push({ text: text.slice(last, start), ltr: false });
    runs.push({ text: m[0], ltr: true });
    last = start + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), ltr: false });
  return runs.filter((r) => r.text.length > 0);
}

/** True when a string mixes Bengali with latin/numeric runs. */
export function isMixedScript(text: string): boolean {
  return segmentMixedScript(text).some((r) => r.ltr);
}
