/**
 * SEO/AEO analysis engine (BUILD 2.6, extended in Phase 2 to Rank Math class).
 *
 * Pure and isomorphic: the admin panel scores a draft while the merchant types
 * (in a Web Worker — see `seo-analysis.worker.ts`), and the server scores the
 * same payload before it is persisted, so a stored score can never disagree
 * with what the merchant was shown. No network, no clock, no randomness, no
 * server imports — every check is deterministic on its input.
 *
 * Design rules that keep it honest:
 *  - every check has a stable `id`, a bilingual label and a bilingual fix hint;
 *  - a check that cannot be judged returns `skip` and leaves the denominator
 *    alone, instead of quietly scoring a warn for something we never measured;
 *  - বাংলা readability is skipped explicitly rather than faked with an English
 *    model;
 *  - content checks only fire once there is enough content to judge (40 words),
 *    so an empty draft is not buried under twenty red dots.
 */

import {
  documentFacts,
  containsPhrase,
  normaliseText,
  phraseOccurrences,
  phrasePosition,
  readability,
  type DocumentFacts,
  type Readability,
} from "./seo-content";
import { SERP_DESKTOP, SERP_FONT, pixelWidth } from "./seo-pixels";
import { headingIssues } from "./seo-technical";

export const SEO_TITLE_MIN = 30;
export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MIN = 70;
export const SEO_DESC_MAX = 160;
export const FAQ_MAX = 12;
export const FAQ_Q_MAX = 180;
export const FAQ_A_MAX = 700;

/** Below this we do not pretend to have an opinion about the body copy. */
export const MIN_JUDGEABLE_WORDS = 40;
/** Rank Math's "good" content floor, kept explicit so tests can assert on it. */
export const CONTENT_WORDS_GOOD = 600;
export const CONTENT_WORDS_MIN = 300;
export const SECONDARY_KEYWORDS_MAX = 4;

export type SeoLocale = "en" | "bn";

export type FaqItem = { q: string; a: string };

export type SeoDraft = {
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogImageUrl: string;
  focusKeyword: string;
  faq: FaqItem[];
  /** Up to four supporting keywords, scored as coverage only. */
  secondaryKeywords?: string[];
  /** Body/marketing copy the entity already has (HTML, markdown or plain). */
  content?: string;
  /** The entity's own path or URL — enables the keyword-in-URL check. */
  url?: string;
  /** Site origin, so same-origin absolute links count as internal. */
  origin?: string;
  /** Locale the copy is written in; drives readability applicability. */
  locale?: SeoLocale;
  /** Fallbacks the storefront would emit when the override is empty. */
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export type SeoCheck = {
  id: string;
  group: "meta" | "social" | "indexing" | "aeo" | "content" | "links" | "readability";
  label: string;
  labelBn: string;
  status: CheckStatus;
  /** English fix hint. Kept as `hint` for backwards compatibility. */
  hint: string;
  hintBn: string;
  weight: number;
};

export type SeoReport = {
  score: number;
  checks: SeoCheck[];
  counts: { pass: number; warn: number; fail: number; skip: number };
  /** Derived facts the UI reuses (word count, links, readability) — no re-parse. */
  facts: {
    words: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    imagesWithAlt: number;
    headings: number;
    titlePx: number;
    descriptionPx: number;
    keywordDensity: number;
    readability: Readability;
  };
};

const HTTPS = /^https:\/\/[^\s]+$/i;

/** Normalises the caller's keyword list: trimmed, de-duplicated, capped. */
export function normaliseKeywords(input: unknown, max = SECONDARY_KEYWORDS_MAX): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const value = String(raw ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!value) continue;
    const key = normaliseText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

/** Deterministic, explainable checks. Weights sum to the score denominator. */
export function analyseSeo(draft: SeoDraft): SeoReport {
  const locale: SeoLocale = draft.locale === "bn" ? "bn" : "en";
  const title = draft.metaTitle.trim() || draft.fallbackTitle?.trim() || "";
  const desc = draft.metaDescription.trim() || draft.fallbackDescription?.trim() || "";
  const keyword = draft.focusKeyword.trim();
  const secondary = normaliseKeywords(draft.secondaryKeywords ?? []);
  const facts: DocumentFacts = documentFacts(draft.content ?? "", { origin: draft.origin ?? "" });
  const judgeable = facts.words >= MIN_JUDGEABLE_WORDS;
  const read = readability(facts, locale);
  const checks: SeoCheck[] = [];

  const push = (
    id: string,
    group: SeoCheck["group"],
    label: [string, string],
    status: CheckStatus,
    hint: [string, string],
    weight: number,
  ) =>
    checks.push({
      id,
      group,
      label: label[0],
      labelBn: label[1],
      status,
      hint: hint[0],
      hintBn: hint[1],
      weight,
    });

  /* ------------------------------- meta ---------------------------------- */

  push(
    "title.length",
    "meta",
    ["Title length", "টাইটেলের দৈর্ঘ্য"],
    title.length === 0
      ? "fail"
      : title.length < SEO_TITLE_MIN || title.length > SEO_TITLE_MAX
        ? "warn"
        : "pass",
    title.length === 0
      ? [
          "Add a title — search results fall back to the store name.",
          "একটি টাইটেল দিন — না হলে সার্চে শুধু স্টোরের নাম দেখাবে।",
        ]
      : [
          `${title.length} characters. Aim for ${SEO_TITLE_MIN}–${SEO_TITLE_MAX}.`,
          `${title.length} অক্ষর। লক্ষ্য ${SEO_TITLE_MIN}–${SEO_TITLE_MAX}।`,
        ],
    18,
  );

  const titlePx = pixelWidth(title, SERP_FONT.title);
  push(
    "title.pixels",
    "meta",
    ["Title width", "টাইটেলের প্রস্থ"],
    title.length === 0 ? "skip" : titlePx > SERP_DESKTOP.titlePx ? "warn" : "pass",
    title.length === 0
      ? ["No title to measure yet.", "মাপার মতো টাইটেল নেই।"]
      : titlePx > SERP_DESKTOP.titlePx
        ? [
            `${titlePx}px of ${SERP_DESKTOP.titlePx}px — Google will cut the end off.`,
            `${SERP_DESKTOP.titlePx}px-এর মধ্যে ${titlePx}px — গুগল শেষাংশ কেটে দেবে।`,
          ]
        : [
            `${titlePx}px of ${SERP_DESKTOP.titlePx}px — fits the desktop snippet.`,
            `${SERP_DESKTOP.titlePx}px-এর মধ্যে ${titlePx}px — ডেস্কটপ স্নিপেটে ধরে যাবে।`,
          ],
    6,
  );

  push(
    "description.length",
    "meta",
    ["Description length", "বর্ণনার দৈর্ঘ্য"],
    desc.length === 0
      ? "fail"
      : desc.length < SEO_DESC_MIN || desc.length > SEO_DESC_MAX
        ? "warn"
        : "pass",
    desc.length === 0
      ? [
          "Add a description — Google will invent a snippet otherwise.",
          "বর্ণনা দিন — না হলে গুগল নিজেই স্নিপেট বানাবে।",
        ]
      : [
          `${desc.length} characters. Aim for ${SEO_DESC_MIN}–${SEO_DESC_MAX}.`,
          `${desc.length} অক্ষর। লক্ষ্য ${SEO_DESC_MIN}–${SEO_DESC_MAX}।`,
        ],
    16,
  );

  const descPx = pixelWidth(desc, SERP_FONT.description);
  push(
    "description.pixels",
    "meta",
    ["Description width", "বর্ণনার প্রস্থ"],
    desc.length === 0 ? "skip" : descPx > SERP_DESKTOP.descriptionPx ? "warn" : "pass",
    desc.length === 0
      ? ["No description to measure yet.", "মাপার মতো বর্ণনা নেই।"]
      : descPx > SERP_DESKTOP.descriptionPx
        ? [
            `${descPx}px of ${SERP_DESKTOP.descriptionPx}px — the tail will be truncated.`,
            `${SERP_DESKTOP.descriptionPx}px-এর মধ্যে ${descPx}px — শেষাংশ কেটে যাবে।`,
          ]
        : [
            `${descPx}px of ${SERP_DESKTOP.descriptionPx}px — fits the desktop snippet.`,
            `${SERP_DESKTOP.descriptionPx}px-এর মধ্যে ${descPx}px — ডেস্কটপ স্নিপেটে ধরে যাবে।`,
          ],
    5,
  );

  push(
    "keyword.set",
    "meta",
    ["Focus keyword", "মূল কীওয়ার্ড"],
    keyword ? "pass" : "warn",
    keyword
      ? [`Optimising for “${keyword}”.`, `“${keyword}” এর জন্য অপটিমাইজ করা হচ্ছে।`]
      : [
          "Set a focus keyword to score coverage.",
          "কভারেজ স্কোর পেতে একটি মূল কীওয়ার্ড দিন।",
        ],
    6,
  );

  let density = 0;

  if (keyword) {
    const inTitle = containsPhrase(title, keyword);
    const position = phrasePosition(title, keyword);
    push(
      "keyword.title",
      "meta",
      ["Keyword in title", "টাইটেলে কীওয়ার্ড"],
      inTitle ? (position <= 0.4 ? "pass" : "warn") : "fail",
      inTitle
        ? position <= 0.4
          ? ["Keyword appears near the start of the title.", "কীওয়ার্ডটি টাইটেলের শুরুর দিকে আছে।"]
          : [
              "Keyword is in the title but late — move it towards the front.",
              "কীওয়ার্ড টাইটেলে আছে কিন্তু পরে — শুরুর দিকে আনুন।",
            ]
        : [
            "The focus keyword should appear in the title, ideally near the start.",
            "মূল কীওয়ার্ডটি টাইটেলে থাকা উচিত, বিশেষত শুরুর দিকে।",
          ],
      12,
    );

    push(
      "keyword.description",
      "meta",
      ["Keyword in description", "বর্ণনায় কীওয়ার্ড"],
      containsPhrase(desc, keyword) ? "pass" : "warn",
      [
        "Repeat the keyword once in the description so the snippet matches intent.",
        "স্নিপেট যেন উদ্দেশ্যের সাথে মেলে, তাই বর্ণনায় কীওয়ার্ডটি একবার রাখুন।",
      ],
      8,
    );

    const occurrences = phraseOccurrences(facts.text, keyword);
    density = facts.words ? (occurrences * Math.max(1, normaliseText(keyword).split(" ").length) / facts.words) * 100 : 0;
    push(
      "keyword.density",
      "meta",
      ["Keyword density", "কীওয়ার্ড ঘনত্ব"],
      !judgeable ? "warn" : density === 0 ? "fail" : density > 4 ? "warn" : "pass",
      !judgeable
        ? [
            "Content is too short to judge density (under 40 words).",
            "ঘনত্ব বিচার করার মতো লেখা যথেষ্ট নয় (৪০ শব্দের কম)।",
          ]
        : [
            `${density.toFixed(1)}% of body words. Healthy range is 0.5–4%.`,
            `লেখার ${density.toFixed(1)}% শব্দ। স্বাস্থ্যকর সীমা ০.৫–৪%।`,
          ],
      8,
    );

    const url = draft.url ?? "";
    const slugText = url.replace(/^https?:\/\/[^/]+/i, "").replace(/[/_-]+/g, " ");
    push(
      "keyword.url",
      "meta",
      ["Keyword in URL", "URL-এ কীওয়ার্ড"],
      draft.url === undefined
        ? "skip"
        : containsPhrase(slugText, keyword)
          ? "pass"
          : "warn",
      draft.url === undefined
        ? ["No URL supplied for this entity.", "এই আইটেমের কোনো URL দেওয়া হয়নি।"]
        : containsPhrase(slugText, keyword)
          ? ["The slug carries the keyword.", "স্লাগে কীওয়ার্ডটি আছে।"]
          : [
              "Put the keyword in the slug — it is the most stable ranking signal you own.",
              "স্লাগে কীওয়ার্ডটি রাখুন — এটি আপনার হাতে থাকা সবচেয়ে স্থিতিশীল সিগন্যাল।",
            ],
      6,
    );

    push(
      "keyword.first_paragraph",
      "content",
      ["Keyword in opening", "শুরুর অনুচ্ছেদে কীওয়ার্ড"],
      !judgeable ? "skip" : containsPhrase(facts.firstParagraph, keyword) ? "pass" : "warn",
      !judgeable
        ? ["Not enough copy to check the opening.", "শুরুর অনুচ্ছেদ যাচাই করার মতো লেখা নেই।"]
        : [
            "Mention the keyword in the first paragraph so the intent is obvious immediately.",
            "প্রথম অনুচ্ছেদেই কীওয়ার্ডটি লিখুন, যাতে উদ্দেশ্য সঙ্গে সঙ্গে বোঝা যায়।",
          ],
      8,
    );

    const inSubheading = facts.headings.some((h) => h.level > 1 && containsPhrase(h.text, keyword));
    push(
      "keyword.subheading",
      "content",
      ["Keyword in a subheading", "সাবহেডিং-এ কীওয়ার্ড"],
      facts.headings.filter((h) => h.level > 1).length === 0
        ? judgeable
          ? "warn"
          : "skip"
        : inSubheading
          ? "pass"
          : "warn",
      [
        "At least one H2/H3 should contain the keyword — it maps the page to the query.",
        "অন্তত একটি H2/H3-তে কীওয়ার্ড রাখুন — এতে পেজটি প্রশ্নের সাথে মেলে।",
      ],
      6,
    );

    const altText = facts.images.map((i) => i.alt).join(" ");
    push(
      "keyword.image_alt",
      "content",
      ["Keyword in image alt", "ইমেজ alt-এ কীওয়ার্ড"],
      facts.images.length === 0 ? "skip" : containsPhrase(altText, keyword) ? "pass" : "warn",
      facts.images.length === 0
        ? ["No images in this content.", "এই লেখায় কোনো ইমেজ নেই।"]
        : [
            "Describe one image with the keyword — image search is free traffic.",
            "অন্তত একটি ইমেজের alt-এ কীওয়ার্ড লিখুন — ইমেজ সার্চ থেকে ফ্রি ট্রাফিক আসে।",
          ],
      5,
    );
  }

  if (secondary.length) {
    const covered = secondary.filter(
      (k) => containsPhrase(`${title} ${desc}`, k) || containsPhrase(facts.text, k),
    );
    push(
      "keyword.secondary",
      "meta",
      ["Secondary keywords", "সহায়ক কীওয়ার্ড"],
      covered.length === secondary.length ? "pass" : covered.length > 0 ? "warn" : "fail",
      [
        `${covered.length} of ${secondary.length} supporting keywords appear in the copy.`,
        `${secondary.length}টির মধ্যে ${covered.length}টি সহায়ক কীওয়ার্ড লেখায় আছে।`,
      ],
      6,
    );
  }

  /* ------------------------------ content -------------------------------- */

  push(
    "content.length",
    "content",
    ["Content length", "লেখার দৈর্ঘ্য"],
    facts.words === 0
      ? "skip"
      : facts.words >= CONTENT_WORDS_GOOD
        ? "pass"
        : facts.words >= CONTENT_WORDS_MIN
          ? "warn"
          : "fail",
    facts.words === 0
      ? ["No body copy attached to this entity.", "এই আইটেমে কোনো লেখা নেই।"]
      : [
          `${facts.words} words. ${CONTENT_WORDS_MIN}+ is competitive, ${CONTENT_WORDS_GOOD}+ is strong.`,
          `${facts.words} শব্দ। ${CONTENT_WORDS_MIN}+ প্রতিযোগিতামূলক, ${CONTENT_WORDS_GOOD}+ শক্তিশালী।`,
        ],
    8,
  );

  const heading = headingIssues(facts.headingLevels);
  push(
    "content.headings",
    "content",
    ["Heading outline", "হেডিং কাঠামো"],
    facts.headings.length === 0 ? "skip" : heading.length === 0 ? "pass" : "warn",
    facts.headings.length === 0
      ? ["No headings found in this content.", "এই লেখায় কোনো হেডিং নেই।"]
      : heading.length === 0
        ? ["One H1 and no skipped levels.", "একটি H1, কোনো লেভেল বাদ পড়েনি।"]
        : [heading.join(" "), "হেডিং ক্রম ঠিক করুন — একটি H1, কোনো লেভেল বাদ নয়।"],
    6,
  );

  const withAlt = facts.images.filter((i) => i.alt.trim().length > 0).length;
  push(
    "content.alt_coverage",
    "content",
    ["Image alt coverage", "ইমেজ alt কভারেজ"],
    facts.images.length === 0
      ? "skip"
      : withAlt === facts.images.length
        ? "pass"
        : withAlt > 0
          ? "warn"
          : "fail",
    facts.images.length === 0
      ? ["No images to describe.", "বর্ণনা করার মতো ইমেজ নেই।"]
      : [
          `${withAlt} of ${facts.images.length} images have alt text.`,
          `${facts.images.length}টির মধ্যে ${withAlt}টি ইমেজে alt টেক্সট আছে।`,
        ],
    6,
  );

  /* -------------------------------- links -------------------------------- */

  push(
    "links.internal",
    "links",
    ["Internal links", "অভ্যন্তরীণ লিংক"],
    !judgeable ? "skip" : facts.internalLinks >= 2 ? "pass" : facts.internalLinks === 1 ? "warn" : "fail",
    !judgeable
      ? ["Too little copy to expect links.", "লিংক আশা করার মতো লেখা নেই।"]
      : [
          `${facts.internalLinks} internal link(s). Two or more spreads authority through the site.`,
          `${facts.internalLinks}টি অভ্যন্তরীণ লিংক। দুই বা তার বেশি হলে সাইটজুড়ে অথরিটি ছড়ায়।`,
        ],
    6,
  );

  push(
    "links.external",
    "links",
    ["Outbound links", "বাইরের লিংক"],
    !judgeable ? "skip" : facts.externalLinks >= 1 ? "pass" : "warn",
    !judgeable
      ? ["Too little copy to expect links.", "লিংক আশা করার মতো লেখা নেই।"]
      : [
          `${facts.externalLinks} outbound link(s). One credible source signals research.`,
          `${facts.externalLinks}টি বাইরের লিংক। অন্তত একটি নির্ভরযোগ্য উৎস গবেষণার প্রমাণ দেয়।`,
        ],
    4,
  );

  /* ----------------------------- readability ------------------------------ */

  if (!read.applicable || !judgeable) {
    push(
      "readability.locale",
      "readability",
      ["Readability", "পঠনযোগ্যতা"],
      "skip",
      locale === "bn"
        ? [
            "Readability scoring is English-only — we do not guess at বাংলা rather than report a wrong number.",
            "পঠনযোগ্যতা স্কোর শুধু ইংরেজির জন্য — ভুল সংখ্যা দেখানোর চেয়ে বাংলায় আমরা কিছু অনুমান করি না।",
          ]
        : ["Not enough copy to assess readability.", "পঠনযোগ্যতা যাচাই করার মতো লেখা নেই।"],
      0,
    );
  } else {
    push(
      "readability.ease",
      "readability",
      ["Reading ease", "পড়ার সহজতা"],
      read.ease >= 60 ? "pass" : read.ease >= 40 ? "warn" : "fail",
      [
        `Flesch reading ease ${read.ease}. Aim for 60+ (plain, shopper-friendly English).`,
        `ফ্লেশ রিডিং ইজ ${read.ease}। লক্ষ্য ৬০+ (সহজ, ক্রেতাবান্ধব ইংরেজি)।`,
      ],
      5,
    );
    push(
      "readability.sentences",
      "readability",
      ["Sentence length", "বাক্যের দৈর্ঘ্য"],
      read.longSentenceRatio <= 0.25 ? "pass" : read.longSentenceRatio <= 0.4 ? "warn" : "fail",
      [
        `${Math.round(read.longSentenceRatio * 100)}% of sentences run over 20 words (target: 25% or less).`,
        `${Math.round(read.longSentenceRatio * 100)}% বাক্য ২০ শব্দের বেশি (লক্ষ্য: ২৫% বা কম)।`,
      ],
      4,
    );
    push(
      "readability.paragraphs",
      "readability",
      ["Paragraph length", "অনুচ্ছেদের দৈর্ঘ্য"],
      read.longParagraphRatio === 0 ? "pass" : "warn",
      [
        "Break paragraphs over 150 words — mobile readers bounce off walls of text.",
        "১৫০ শব্দের বেশি অনুচ্ছেদ ভাগ করুন — মোবাইলে বড় ব্লক পড়তে কেউ থাকে না।",
      ],
      3,
    );
    push(
      "readability.passive",
      "readability",
      ["Passive voice", "নিষ্ক্রিয় বাক্য"],
      read.passiveRatio <= 0.1 ? "pass" : read.passiveRatio <= 0.2 ? "warn" : "fail",
      [
        `${Math.round(read.passiveRatio * 100)}% of sentences look passive (target: 10% or less).`,
        `${Math.round(read.passiveRatio * 100)}% বাক্য নিষ্ক্রিয় মনে হচ্ছে (লক্ষ্য: ১০% বা কম)।`,
      ],
      3,
    );
  }

  /* -------------------------------- social -------------------------------- */

  push(
    "social.image",
    "social",
    ["Social share image", "সোশ্যাল শেয়ার ইমেজ"],
    draft.ogImageUrl.trim() === "" ? "warn" : HTTPS.test(draft.ogImageUrl.trim()) ? "pass" : "fail",
    draft.ogImageUrl.trim() === ""
      ? [
          "Without an image the card renders as a plain text link.",
          "ইমেজ না থাকলে শেয়ার কার্ড শুধু সাদামাটা লিংক দেখাবে।",
        ]
      : HTTPS.test(draft.ogImageUrl.trim())
        ? ["Large summary card will be used.", "বড় সামারি কার্ড ব্যবহার হবে।"]
        : [
            "The image URL must be an absolute https:// link.",
            "ইমেজ URL অবশ্যই সম্পূর্ণ https:// লিংক হতে হবে।",
          ],
    10,
  );

  /* ------------------------------- indexing ------------------------------- */

  push(
    "indexing.robots",
    "indexing",
    ["Indexing directive", "ইনডেক্সিং নির্দেশ"],
    draft.robotsIndex ? "pass" : "warn",
    draft.robotsIndex
      ? [
          `Crawlers may index this page (${draft.robotsFollow ? "follow" : "nofollow"} links).`,
          `ক্রলার এই পেজ ইনডেক্স করতে পারবে (${draft.robotsFollow ? "follow" : "nofollow"} লিংক)।`,
        ]
      : [
          "This page is hidden from search and excluded from the sitemap.",
          "এই পেজ সার্চ থেকে লুকানো এবং সাইটম্যাপ থেকে বাদ।",
        ],
    6,
  );

  const canonical = draft.canonical.trim();
  push(
    "indexing.canonical",
    "indexing",
    ["Canonical URL", "ক্যানোনিকাল URL"],
    canonical === "" ? "pass" : HTTPS.test(canonical) ? "pass" : "fail",
    canonical === ""
      ? ["Defaults to this page's own absolute URL.", "ডিফল্টভাবে এই পেজের নিজের URL ব্যবহার হবে।"]
      : HTTPS.test(canonical)
        ? ["Custom canonical will override the default.", "কাস্টম ক্যানোনিকাল ডিফল্টের বদলে বসবে।"]
        : [
            "A canonical must be an absolute https:// URL.",
            "ক্যানোনিকাল অবশ্যই সম্পূর্ণ https:// URL হতে হবে।",
          ],
    6,
  );

  /* --------------------------------- AEO ---------------------------------- */

  const faq = draft.faq.filter((f) => f.q.trim() && f.a.trim());
  push(
    "aeo.faq",
    "aeo",
    ["Answer schema (FAQ)", "উত্তর স্কিমা (FAQ)"],
    faq.length === 0 ? "warn" : faq.length > FAQ_MAX ? "fail" : "pass",
    faq.length === 0
      ? [
          "Add 2–5 questions so assistants can quote a direct answer.",
          "২–৫টি প্রশ্ন যোগ করুন, যাতে সহকারীরা সরাসরি উত্তর উদ্ধৃত করতে পারে।",
        ]
      : faq.length > FAQ_MAX
        ? [`Keep FAQ entries at ${FAQ_MAX} or fewer.`, `FAQ সর্বোচ্চ ${FAQ_MAX}টি রাখুন।`]
        : [
            `${faq.length} question${faq.length === 1 ? "" : "s"} will be emitted as FAQPage JSON-LD.`,
            `${faq.length}টি প্রশ্ন FAQPage JSON-LD হিসেবে যাবে।`,
          ],
    10,
  );

  const tooLong = faq.find((f) => f.q.length > FAQ_Q_MAX || f.a.length > FAQ_A_MAX);
  if (faq.length > 0) {
    push(
      "aeo.answer_length",
      "aeo",
      ["Answer length", "উত্তরের দৈর্ঘ্য"],
      tooLong ? "fail" : "pass",
      tooLong
        ? [
            `Questions cap at ${FAQ_Q_MAX} and answers at ${FAQ_A_MAX} characters.`,
            `প্রশ্ন সর্বোচ্চ ${FAQ_Q_MAX} এবং উত্তর সর্বোচ্চ ${FAQ_A_MAX} অক্ষর।`,
          ]
        : [
            "Answers are short enough to be quoted verbatim.",
            "উত্তরগুলো হুবহু উদ্ধৃত করার মতো ছোট।",
          ],
      6,
    );
  }

  const scored = checks.filter((c) => c.status !== "skip");
  const total = scored.reduce((n, c) => n + c.weight, 0);
  const earned = scored.reduce(
    (n, c) => n + (c.status === "pass" ? c.weight : c.status === "warn" ? c.weight * 0.5 : 0),
    0,
  );

  return {
    score: total === 0 ? 0 : Math.round((earned / total) * 100),
    checks,
    counts: {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      skip: checks.filter((c) => c.status === "skip").length,
    },
    facts: {
      words: facts.words,
      internalLinks: facts.internalLinks,
      externalLinks: facts.externalLinks,
      images: facts.images.length,
      imagesWithAlt: withAlt,
      headings: facts.headings.length,
      titlePx,
      descriptionPx: descPx,
      keywordDensity: density,
      readability: read,
    },
  };
}

export function scoreBand(score: number): { tone: "danger" | "warning" | "success"; label: string } {
  if (score >= 80) return { tone: "success", label: "Good" };
  if (score >= 50) return { tone: "warning", label: "Needs work" };
  return { tone: "danger", label: "Poor" };
}

/** Normalises untrusted FAQ input to the stored shape (caps applied, no markup). */
export function normaliseFaq(input: unknown): FaqItem[] {
  if (!Array.isArray(input)) return [];
  const out: FaqItem[] = [];
  for (const raw of input.slice(0, FAQ_MAX)) {
    if (!raw || typeof raw !== "object") continue;
    const q = String((raw as Record<string, unknown>)["q"] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, FAQ_Q_MAX);
    const a = String((raw as Record<string, unknown>)["a"] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, FAQ_A_MAX);
    if (q && a) out.push({ q, a });
  }
  return out;
}
