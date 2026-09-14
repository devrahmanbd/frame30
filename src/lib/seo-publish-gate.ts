/**
 * Publish gate for SEO facts (Phase 2) — pure, so both the admin and the
 * server enforce exactly the same rules.
 *
 * The score is advisory: a merchant may publish a 41/100 page, and blocking
 * that would only teach them to game the number. What is *not* advisory is a
 * factual defect that quietly removes the page from search or hands its ranking
 * to something else:
 *
 *  - no title at all (the SERP falls back to the store name for every page);
 *  - a title already used by a live sibling in the same tenant, which is how
 *    self-cannibalisation starts — we name the offending sibling;
 *  - a canonical pointing away from this page while the page is still indexable
 *    and in the sitemap (a self-inflicted deindex);
 *  - noindex while the entity is still advertised in the sitemap — telling a
 *    crawler two contradictory things wastes the crawl budget and the trust.
 *
 * Every failure carries a stable machine code, an English message and a বাংলা
 * message, because the merchant reading it may be either.
 */

export type SeoGateFailure = {
  code:
    | "title_missing"
    | "title_duplicate"
    | "canonical_offsite"
    | "canonical_invalid"
    | "noindex_in_sitemap"
    | "description_missing";
  message: string;
  messageBn: string;
  /** Blocking failures stop a publish; advisory ones are shown but allowed. */
  blocking: boolean;
  /** Present for `title_duplicate`: the sibling that already owns the title. */
  conflictWith?: { type: string; id: string | null; label: string };
};

export type SeoGateInput = {
  entityType: string;
  entityId: string | null;
  /** Effective title after templates and fallbacks — what will actually ship. */
  title: string;
  description: string;
  canonical: string;
  robotsIndex: boolean;
  /** Absolute URL this entity will be reachable at. */
  selfUrl: string;
  /** Whether the entity is advertised in a sitemap when indexable. */
  inSitemap: boolean;
  /** Live siblings in the same tenant, for the duplicate-title check. */
  siblings: readonly { type: string; id: string | null; label: string; title: string }[];
};

export type SeoGateReport = {
  ok: boolean;
  failures: SeoGateFailure[];
  /** Advisory notes that never block. */
  notices: SeoGateFailure[];
};

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function samePage(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const strip = (p: string) => p.replace(/\/+$/, "") || "/";
    return left.origin === right.origin && strip(left.pathname) === strip(right.pathname);
  } catch {
    return false;
  }
}

/** Titles compare case-insensitively with collapsed whitespace, like a SERP. */
export function titleKey(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

export function composeSeoPublishGate(input: SeoGateInput): SeoGateReport {
  const failures: SeoGateFailure[] = [];
  const notices: SeoGateFailure[] = [];

  const title = input.title.replace(/\s+/g, " ").trim();

  if (!title) {
    failures.push({
      code: "title_missing",
      blocking: true,
      message: "This page has no title — every search result would show the store name instead.",
      messageBn: "এই পেজের কোনো টাইটেল নেই — সার্চে শুধু স্টোরের নাম দেখাবে।",
    });
  } else {
    const key = titleKey(title);
    const clash = input.siblings.find(
      (s) =>
        titleKey(s.title) === key &&
        !(s.type === input.entityType && (s.id ?? null) === (input.entityId ?? null)),
    );
    if (clash) {
      failures.push({
        code: "title_duplicate",
        blocking: true,
        message: `“${title}” is already the live title of ${clash.type} “${clash.label}” — two pages competing for one query rank neither.`,
        messageBn: `“${title}” ইতিমধ্যেই ${clash.type} “${clash.label}”-এর টাইটেল — একই প্রশ্নে দুটি পেজ লড়লে কোনোটিই র‍্যাঙ্ক করে না।`,
        conflictWith: { type: clash.type, id: clash.id, label: clash.label },
      });
    }
  }

  if (!input.description.trim()) {
    notices.push({
      code: "description_missing",
      blocking: false,
      message: "No description — Google will assemble a snippet from whatever it finds on the page.",
      messageBn: "বর্ণনা নেই — গুগল পেজ থেকে যা পায় তা দিয়েই স্নিপেট বানাবে।",
    });
  }

  const canonical = input.canonical.trim();
  if (canonical) {
    if (!/^https:\/\/[^\s]+$/i.test(canonical)) {
      failures.push({
        code: "canonical_invalid",
        blocking: true,
        message: "The canonical URL must be an absolute https:// address.",
        messageBn: "ক্যানোনিকাল URL অবশ্যই সম্পূর্ণ https:// ঠিকানা হতে হবে।",
      });
    } else if (input.robotsIndex && input.selfUrl && !samePage(canonical, input.selfUrl)) {
      const offsite = input.selfUrl ? !sameOrigin(canonical, input.selfUrl) : true;
      failures.push({
        code: "canonical_offsite",
        blocking: true,
        message: `This page is indexable but its canonical points ${offsite ? "off-site" : "at another page"} (${canonical}) — search engines will credit that URL, not this one.`,
        messageBn: `পেজটি ইনডেক্সযোগ্য, কিন্তু ক্যানোনিকাল ${offsite ? "অন্য সাইটে" : "অন্য পেজে"} (${canonical}) নির্দেশ করছে — সার্চ ইঞ্জিন সেই URL-কেই কৃতিত্ব দেবে।`,
      });
    }
  }

  if (!input.robotsIndex && input.inSitemap) {
    failures.push({
      code: "noindex_in_sitemap",
      blocking: true,
      message: "The page is set to noindex but is still advertised in the sitemap — remove one of the two.",
      messageBn: "পেজটি noindex, অথচ সাইটম্যাপে এখনো আছে — দুটির একটি বদলান।",
    });
  }

  return { ok: failures.every((f) => !f.blocking), failures, notices };
}
