/**
 * Phase 10.3 — the voice rules, expressed as code.
 *
 * A style guide that lives only in a markdown file decays the first time a
 * deadline arrives. This module is the executable half of
 * `docs/05-marketing/voice-and-messaging.md`: every rule we claim to hold in
 * prose is checkable here, and `copy-quality.contract.test.ts` runs it over
 * the entire dictionary on every build.
 *
 * Design notes:
 *   • Pure. No React, no I/O, no network — it must be runnable from a test,
 *     a script, or a server function with identical results.
 *   • Findings, not exceptions. Copy review is advisory in places (long
 *     sentences) and blocking in others (missing Bangla, hype words), so the
 *     auditor returns a severity per finding and the caller decides.
 *   • Bilingual-symmetric. Bangla is a first-class locale: an entry whose
 *     Bangla is a copy of the English, empty, or missing a placeholder that
 *     English uses is a defect, not a "fallback".
 */

export type Severity = "error" | "warn";

export type CopyFinding = {
  key: string;
  locale: "en" | "bn" | "both";
  rule: string;
  severity: Severity;
  message: string;
  /** The offending fragment, trimmed for log lines. */
  sample?: string;
};

export type CopyEntry = { en: string; bn: string };

/**
 * Hype and consultant-speak. These are banned outright: they promise a feeling
 * instead of a fact, and every one of them has a concrete replacement.
 * Matched case-insensitively on word boundaries against English copy.
 */
export const BANNED_HYPE = [
  "revolutionise",
  "revolutionize",
  "revolutionary",
  "game-changing",
  "game changer",
  "cutting-edge",
  "bleeding-edge",
  "world-class",
  "best-in-class",
  "industry-leading",
  "next-generation",
  "state-of-the-art",
  "seamlessly",
  "effortlessly",
  "magical",
  "unleash",
  "supercharge",
  "turbocharge",
  "10x",
  "synergy",
  "leverage",
  "paradigm",
  "disrupt",
  "delightful",
  "blazing fast",
  "lightning fast",
  "one-stop shop",
  "solutions provider",
] as const;

/**
 * Weasel words: unfalsifiable claims. Allowed only where a number follows in
 * the same sentence (see `hasAdjacentNumber`), because "faster" with a measured
 * figure is a claim, and "faster" alone is a wish.
 */
export const WEASEL_WORDS = [
  "faster",
  "cheaper",
  "better",
  "easier",
  "simple",
  "secure",
  "reliable",
  "powerful",
  "robust",
  "scalable",
] as const;

/** Words we never use because they are not true of this product yet. */
export const FORBIDDEN_CLAIMS = [
  "guaranteed",
  "100% uptime",
  "unlimited",
  "risk-free",
  "instant approval",
  "bank-grade",
  "military-grade",
] as const;

/** Bangla writing we reject: transliterated English where a Bangla word exists. */
export const BANGLA_LINT: { bad: string; use: string }[] = [
  { bad: "ইউজার", use: "ব্যবহারকারী / ক্রেতা" },
  { bad: "কাস্টমাইজ", use: "নিজের মতো সাজান" },
  { bad: "অপ্টিমাইজ", use: "দ্রুত করা" },
  { bad: "সলিউশন", use: "সমাধান" },
  { bad: "রেভুলেশন", use: "—" },
];

/**
 * Brand and product nouns that are legitimately identical in both locales.
 * Without this list every "bKash" or "POS" key would fail the "bn must differ
 * from en" rule, and we would end up weakening the rule instead of the list.
 */
export const LOCALE_IDENTICAL_ALLOWLIST = new Set<string>([
  "Framique",
  "bKash",
  // An email example is a literal, not prose: transliterating it would teach
  // Bangla readers to type a mailbox that does not exist.
  "you@yourstore.com",
  "Nagad",
  "Rocket",
  "POS",
  "SSLCOMMERZ",
  "CSV",
  "API",
  "SEO",
  "PDF",
  "SMS",
  "BDT",
  "৳",
  "—",
  "…",
]);

/** Copy limits. Marketing headings stay short; nobody reads a 30-word button. */
export const COPY_LIMITS = {
  buttonMaxChars: 28,
  headingMaxChars: 70,
  metaTitleMaxChars: 60,
  metaDescriptionMaxChars: 160,
  sentenceMaxWords: 28,
  maxExclamations: 0,
} as const;

const wordBoundary = (phrase: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(phrase)}($|[^\\p{L}\\p{N}])`, "iu");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a digit appears within the same sentence as `index`. */
export function hasAdjacentNumber(text: string, index: number): boolean {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const endDot = text.indexOf(".", index);
  const end = endDot === -1 ? text.length : endDot;
  return /[0-9০-৯]/.test(text.slice(start, end));
}

/** Placeholders such as `{count}` must exist in both locales, or interpolation lies. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

/**
 * Money must carry a currency. We write BDT amounts as `৳1,200` or
 * `BDT 1,200` — a bare number in pricing copy is how a merchant ends up
 * believing a figure is in dollars.
 */
export function moneyFindings(key: string, text: string, locale: "en" | "bn"): CopyFinding[] {
  const out: CopyFinding[] = [];
  const priceish = /(?:^|\s)(?:tk|taka|৳|BDT)\s*([0-9][0-9,]*)/gi;
  for (const match of text.matchAll(priceish)) {
    const token = match[0].trim();
    if (/^(?:tk|taka)/i.test(token)) {
      out.push({
        key,
        locale,
        rule: "money.currency-token",
        severity: "error",
        message: "Write BDT money as `৳1,200` or `BDT 1,200`, never `Tk`/`Taka`.",
        sample: token,
      });
    }
  }
  return out;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type AuditOptions = {
  /** Keys under these prefixes are treated as button/CTA copy (length capped). */
  buttonPrefixes?: string[];
  /** Keys under these prefixes are treated as headings. */
  headingPrefixes?: string[];
};

const DEFAULT_OPTIONS: Required<AuditOptions> = {
  buttonPrefixes: ["common.", "site.cta.", "home.cta.", "site.nav."],
  headingPrefixes: ["home.headline", "home.hero", ".title", ".headline"],
};

function matchesPrefix(key: string, prefixes: string[]) {
  return prefixes.some((p) => (p.startsWith(".") ? key.endsWith(p) : key.startsWith(p)));
}

/** Audit a single dictionary entry against every voice rule. */
export function auditEntry(key: string, entry: CopyEntry, options: AuditOptions = {}): CopyFinding[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const out: CopyFinding[] = [];
  const en = (entry.en ?? "").trim();
  const bn = (entry.bn ?? "").trim();

  if (!en) {
    out.push({ key, locale: "en", rule: "locale.missing", severity: "error", message: "English copy is empty." });
  }
  if (!bn) {
    out.push({ key, locale: "bn", rule: "locale.missing", severity: "error", message: "Bangla copy is empty — Bangla is not optional." });
  }
  if (en && bn && en === bn && !LOCALE_IDENTICAL_ALLOWLIST.has(en)) {
    out.push({
      key,
      locale: "both",
      rule: "locale.untranslated",
      severity: "error",
      message: "Bangla is a byte-identical copy of English.",
      sample: en.slice(0, 60),
    });
  }

  const pEn = placeholders(en);
  const pBn = placeholders(bn);
  if (pEn.join("|") !== pBn.join("|")) {
    out.push({
      key,
      locale: "both",
      rule: "locale.placeholder-parity",
      severity: "error",
      message: `Placeholder mismatch: en {${pEn.join(",")}} vs bn {${pBn.join(",")}}.`,
    });
  }

  for (const phrase of BANNED_HYPE) {
    if (wordBoundary(phrase).test(en)) {
      out.push({ key, locale: "en", rule: "voice.hype", severity: "error", message: `Banned hype word "${phrase}" — state the fact instead.`, sample: phrase });
    }
  }

  for (const phrase of FORBIDDEN_CLAIMS) {
    if (wordBoundary(phrase).test(en)) {
      out.push({ key, locale: "en", rule: "voice.unsupported-claim", severity: "error", message: `"${phrase}" is a promise we cannot evidence.`, sample: phrase });
    }
  }

  for (const word of WEASEL_WORDS) {
    const re = wordBoundary(word);
    const m = re.exec(en);
    if (m && !hasAdjacentNumber(en, m.index)) {
      out.push({
        key,
        locale: "en",
        rule: "voice.unquantified",
        severity: "warn",
        message: `"${word}" without a number in the same sentence.`,
        sample: word,
      });
    }
  }

  for (const rule of BANGLA_LINT) {
    if (bn.includes(rule.bad)) {
      out.push({
        key,
        locale: "bn",
        rule: "bangla.transliteration",
        severity: "warn",
        message: `Avoid "${rule.bad}" — prefer ${rule.use}.`,
        sample: rule.bad,
      });
    }
  }

  const bangs = (en.match(/!/g) ?? []).length + (bn.match(/!/g) ?? []).length;
  if (bangs > COPY_LIMITS.maxExclamations) {
    out.push({ key, locale: "both", rule: "voice.exclamation", severity: "error", message: "No exclamation marks in product copy." });
  }

  if (/\b(lorem ipsum|TODO|TBD|FIXME|placeholder text)\b/i.test(`${en} ${bn}`)) {
    out.push({ key, locale: "both", rule: "voice.placeholder-copy", severity: "error", message: "Placeholder copy shipped to a user-visible string." });
  }

  // Some `common.*` keys are prose (errors, offline notices, body copy), not
  // labels. A trailing sentence terminator is the reliable signal, so the
  // button cap only applies to label-shaped strings.
  const looksLikeProse = /[.!?।]\s*$/.test(en) || key.includes(".error.") || key.endsWith(".body");
  if (!looksLikeProse && matchesPrefix(key, opts.buttonPrefixes) && en.length > COPY_LIMITS.buttonMaxChars) {
    out.push({
      key,
      locale: "en",
      rule: "length.button",
      severity: "warn",
      message: `Button copy is ${en.length} chars (max ${COPY_LIMITS.buttonMaxChars}).`,
    });
  }

  if (matchesPrefix(key, opts.headingPrefixes) && en.length > COPY_LIMITS.headingMaxChars) {
    out.push({
      key,
      locale: "en",
      rule: "length.heading",
      severity: "warn",
      message: `Heading is ${en.length} chars (max ${COPY_LIMITS.headingMaxChars}).`,
    });
  }

  for (const sentence of sentences(en)) {
    const words = sentence.split(/\s+/).length;
    if (words > COPY_LIMITS.sentenceMaxWords) {
      out.push({
        key,
        locale: "en",
        rule: "length.sentence",
        severity: "warn",
        message: `Sentence runs ${words} words (max ${COPY_LIMITS.sentenceMaxWords}). Split it.`,
        sample: sentence.slice(0, 70),
      });
    }
  }

  out.push(...moneyFindings(key, en, "en"), ...moneyFindings(key, bn, "bn"));
  return out;
}

/** Audit a whole dictionary. Deterministic order so diffs of the report are readable. */
export function auditDictionary(
  dict: Record<string, CopyEntry>,
  options: AuditOptions = {},
): CopyFinding[] {
  return Object.keys(dict)
    .sort()
    .flatMap((key) => auditEntry(key, dict[key] as CopyEntry, options));
}

export function errorsOnly(findings: CopyFinding[]): CopyFinding[] {
  return findings.filter((f) => f.severity === "error");
}

export function formatFindings(findings: CopyFinding[]): string {
  return findings
    .map((f) => `  • [${f.severity}] ${f.key} (${f.locale}) ${f.rule}: ${f.message}${f.sample ? ` — "${f.sample}"` : ""}`)
    .join("\n");
}

/** Meta-tag limits, used by route `head()` reviews and the SEO gate. */
export function auditMeta(title: string, description: string): CopyFinding[] {
  const out: CopyFinding[] = [];
  if (title.length > COPY_LIMITS.metaTitleMaxChars) {
    out.push({ key: title, locale: "en", rule: "meta.title", severity: "error", message: `Title is ${title.length} chars (max ${COPY_LIMITS.metaTitleMaxChars}).` });
  }
  if (description.length > COPY_LIMITS.metaDescriptionMaxChars) {
    out.push({ key: title, locale: "en", rule: "meta.description", severity: "error", message: `Description is ${description.length} chars (max ${COPY_LIMITS.metaDescriptionMaxChars}).` });
  }
  return out;
}
