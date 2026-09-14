/**
 * Ad-fraud defense engine — §4.2 (the moat).
 *
 * Pure, deterministic and isomorphic: no network, no database, no clock reads
 * that are not passed in. Every verdict a merchant sees on a click, a visitor
 * or a campaign is produced here, so the same code path is unit-tested, runs
 * server-side for the real decision, and renders the Bangla explainer in the
 * UI without a second (drifting) implementation.
 *
 * Nothing in this module trusts the client: the storefront can only report raw
 * observations (dwell time, interaction counts, user agent). Weights, ceilings
 * and verdict thresholds live here on the server side of the boundary.
 */

export const AD_FRAUD_ENGINE_VERSION = 1;

export const AD_NETWORKS = [
  { key: "facebook", en: "Facebook / Meta", bn: "ফেসবুক / মেটা", clickIdParam: "fbclid" },
  { key: "google", en: "Google Ads", bn: "গুগল অ্যাডস", clickIdParam: "gclid" },
  { key: "tiktok", en: "TikTok Ads", bn: "টিকটক অ্যাডস", clickIdParam: "ttclid" },
  { key: "other", en: "Other / direct", bn: "অন্যান্য", clickIdParam: "clid" },
] as const;

export type AdNetwork = (typeof AD_NETWORKS)[number]["key"];

export function isAdNetwork(value: string): value is AdNetwork {
  return AD_NETWORKS.some((n) => n.key === value);
}

export type AdVerdict = "valid" | "suspicious" | "invalid";

export type SignalCode =
  | "BLOCKLISTED"
  | "NETWORK_ABUSE"
  | "DATACENTER_IP"
  | "HEADLESS_SIGNATURE"
  | "BOT_USER_AGENT"
  | "NO_JAVASCRIPT"
  | "CLICK_FLOOD"
  | "IP_FANOUT"
  | "DWELL_TOO_SHORT"
  | "NO_INTERACTION"
  | "REPEAT_CLICK_ID"
  | "GEO_MISMATCH"
  | "TIMEZONE_MISMATCH"
  | "MISSING_REFERRER"
  | "IMPOSSIBLE_SPEED";

export type SignalDef = {
  code: SignalCode;
  /** Contribution to the 0-100 click risk score. */
  weight: number;
  /** A firing signal at this severity forces `invalid` regardless of score. */
  decisive: boolean;
  en: string;
  bn: string;
  /** Merchant-facing "what do I do about it" line, in Bangla, per §4.2. */
  fixBn: string;
  fixEn: string;
};

export const SIGNAL_CATALOG: SignalDef[] = [
  {
    code: "BLOCKLISTED",
    weight: 100,
    decisive: true,
    en: "On your blocklist",
    bn: "আপনার ব্লকলিস্টে আছে",
    fixEn: "This source was blocked earlier by you or by an automatic sweep.",
    fixBn: "এই সোর্সটি আগে আপনি বা স্বয়ংক্রিয় সুইপ ব্লক করেছিল।",
  },
  {
    code: "NETWORK_ABUSE",
    weight: 45,
    decisive: false,
    en: "Known abusive source across stores",
    bn: "একাধিক দোকানে অপব্যবহারকারী সোর্স",
    fixEn: "Other Framique stores reported this fingerprint. No shopper data is shared — only a one-way hash.",
    fixBn: "অন্য ফ্রেমিক দোকানও এই ফিঙ্গারপ্রিন্ট রিপোর্ট করেছে। কোনো ক্রেতার তথ্য শেয়ার হয় না, শুধু একমুখী হ্যাশ।",
  },
  {
    code: "DATACENTER_IP",
    weight: 35,
    decisive: false,
    en: "Datacenter / proxy network",
    bn: "ডেটাসেন্টার বা প্রক্সি নেটওয়ার্ক",
    fixEn: "Real shoppers browse from mobile or broadband networks, not servers.",
    fixBn: "আসল ক্রেতা মোবাইল বা ব্রডব্যান্ড থেকে আসে, সার্ভার থেকে নয়।",
  },
  {
    code: "HEADLESS_SIGNATURE",
    weight: 40,
    decisive: false,
    en: "Automated browser signature",
    bn: "অটোমেটেড ব্রাউজারের চিহ্ন",
    fixEn: "The browser reported automation flags a real phone never sets.",
    fixBn: "ব্রাউজারটি এমন অটোমেশন ফ্ল্যাগ দেখিয়েছে যা আসল ফোনে থাকে না।",
  },
  {
    code: "BOT_USER_AGENT",
    weight: 50,
    decisive: false,
    en: "Crawler user agent",
    bn: "ক্রলার ইউজার এজেন্ট",
    fixEn: "The visitor identified itself as a bot or scraper.",
    fixBn: "ভিজিটর নিজেকে বট বা স্ক্র্যাপার হিসেবে পরিচয় দিয়েছে।",
  },
  {
    code: "NO_JAVASCRIPT",
    weight: 25,
    decisive: false,
    en: "No JavaScript execution",
    bn: "জাভাস্ক্রিপ্ট চলেনি",
    fixEn: "The landing page never executed, so nobody actually saw your ad page.",
    fixBn: "ল্যান্ডিং পেজ চালুই হয়নি, অর্থাৎ কেউ আসলে আপনার পেজ দেখেনি।",
  },
  {
    code: "CLICK_FLOOD",
    weight: 30,
    decisive: false,
    en: "Repeated clicks in a short window",
    bn: "অল্প সময়ে বারবার ক্লিক",
    fixEn: "The same fingerprint clicked your ad many times within an hour.",
    fixBn: "একই ফিঙ্গারপ্রিন্ট এক ঘণ্টায় বহুবার আপনার বিজ্ঞাপনে ক্লিক করেছে।",
  },
  {
    code: "IP_FANOUT",
    weight: 20,
    decisive: false,
    en: "Many identities behind one address",
    bn: "এক আইপি থেকে অনেক পরিচয়",
    fixEn: "Dozens of distinct visitors from one address usually means a click farm.",
    fixBn: "এক ঠিকানা থেকে বহু আলাদা ভিজিটর মানে সাধারণত ক্লিক ফার্ম।",
  },
  {
    code: "DWELL_TOO_SHORT",
    weight: 20,
    decisive: false,
    en: "Left before the page painted",
    bn: "পেজ লোড হওয়ার আগেই চলে গেছে",
    fixEn: "Under two seconds on the landing page — no human reads that fast.",
    fixBn: "ল্যান্ডিং পেজে দুই সেকেন্ডের কম — কোনো মানুষ এত দ্রুত পড়ে না।",
  },
  {
    code: "NO_INTERACTION",
    weight: 15,
    decisive: false,
    en: "No scroll, tap or keystroke",
    bn: "কোনো স্ক্রল, ট্যাপ বা কি-প্রেস নেই",
    fixEn: "A real visit produces at least one movement event.",
    fixBn: "আসল ভিজিটে অন্তত একটি মুভমেন্ট ইভেন্ট থাকে।",
  },
  {
    code: "REPEAT_CLICK_ID",
    weight: 25,
    decisive: false,
    en: "Reused ad click id",
    bn: "একই অ্যাড ক্লিক আইডি পুনরায় ব্যবহৃত",
    fixEn: "The network's click id was replayed, which points at a scripted click.",
    fixBn: "নেটওয়ার্কের ক্লিক আইডি রিপ্লে হয়েছে, যা স্ক্রিপ্টেড ক্লিক নির্দেশ করে।",
  },
  {
    code: "GEO_MISMATCH",
    weight: 15,
    decisive: false,
    en: "Outside your targeting country",
    bn: "আপনার টার্গেট দেশের বাইরে",
    fixEn: "You are paying for a click from a country you did not target.",
    fixBn: "আপনি এমন দেশের ক্লিকের জন্য টাকা দিচ্ছেন যা আপনি টার্গেট করেননি।",
  },
  {
    code: "TIMEZONE_MISMATCH",
    weight: 10,
    decisive: false,
    en: "Device clock does not match the claimed country",
    bn: "ডিভাইসের সময় দাবি করা দেশের সাথে মেলে না",
    fixEn: "A common tell of a masked or proxied visitor.",
    fixBn: "মাস্ক করা বা প্রক্সি ভিজিটরের সাধারণ লক্ষণ।",
  },
  {
    code: "MISSING_REFERRER",
    weight: 10,
    decisive: false,
    en: "Click id without an ad referrer",
    bn: "রেফারার ছাড়া ক্লিক আইডি",
    fixEn: "The visit carried an ad click id but never came from the ad network.",
    fixBn: "ভিজিটে অ্যাড ক্লিক আইডি ছিল কিন্তু আসলে অ্যাড নেটওয়ার্ক থেকে আসেনি।",
  },
  {
    code: "IMPOSSIBLE_SPEED",
    weight: 25,
    decisive: false,
    en: "Impossible journey speed",
    bn: "অসম্ভব দ্রুত যাত্রা",
    fixEn: "The same identity appeared from far-apart networks within minutes.",
    fixBn: "একই পরিচয় কয়েক মিনিটেই দূরের নেটওয়ার্ক থেকে দেখা গেছে।",
  },
];

const SIGNAL_BY_CODE = new Map(SIGNAL_CATALOG.map((s) => [s.code, s] as const));

export function signalDef(code: SignalCode) {
  return SIGNAL_BY_CODE.get(code) ?? null;
}

/** Score at or above which a click is refused attribution outright. */
export const INVALID_THRESHOLD = 70;
/** Score at or above which a click is quarantined for review. */
export const SUSPICIOUS_THRESHOLD = 40;

export type ClickInput = {
  network: AdNetwork;
  /** Whether the landing page ran our JS at all. */
  javascriptRan: boolean;
  /** Automation flags reported by the page (webdriver, zero plugins, etc.). */
  automationHints: number;
  userAgent: string;
  /** Milliseconds on the landing page before the beacon fired. */
  dwellMs: number;
  /** Count of scroll/tap/key events observed. */
  interactions: number;
  clickId: string | null;
  clickIdSeenBefore: boolean;
  referrerHost: string | null;
  ipClass: "residential" | "mobile" | "datacenter" | "vpn" | "unknown";
  /** Clicks from this fingerprint on this merchant in the trailing hour. */
  clicksLastHour: number;
  /** Distinct visitor hashes behind this ip hash in the trailing hour. */
  distinctVisitorsPerIp: number;
  visitorCountry: string | null;
  targetCountry: string | null;
  timezoneOffsetMinutes: number | null;
  /** Minutes since this visitor was last seen on a different network prefix. */
  minutesSinceDistantHop: number | null;
  blocklisted: boolean;
  /** Privacy-preserving cross-merchant report count for this fingerprint. */
  networkReports: number;
};

export type FiredSignal = { code: SignalCode; weight: number; detail?: string };

export type ClickScore = {
  score: number;
  verdict: AdVerdict;
  signals: FiredSignal[];
  decisiveCode: SignalCode | null;
  engineVersion: number;
};

const BOT_UA = /(bot|crawler|spider|headless|phantom|curl|wget|python-requests|scrapy|axios|http-client)/i;

/** Bangladesh time is UTC+6; other targets fall back to a generous window. */
const COUNTRY_OFFSETS: Record<string, number[]> = {
  BD: [360],
  IN: [330],
  US: [-300, -360, -420, -480],
};

function push(list: FiredSignal[], code: SignalCode, detail?: string) {
  const def = SIGNAL_BY_CODE.get(code);
  if (!def) return;
  list.push(detail ? { code, weight: def.weight, detail } : { code, weight: def.weight });
}

/**
 * Scores one ad click. Returns every firing signal (not just the winner) so
 * the merchant explainer can show the full reasoning instead of a bare number.
 */
export function scoreClick(input: ClickInput): ClickScore {
  const signals: FiredSignal[] = [];

  if (input.blocklisted) push(signals, "BLOCKLISTED");
  if (input.networkReports >= 3) push(signals, "NETWORK_ABUSE", `${input.networkReports} reports`);
  if (input.ipClass === "datacenter" || input.ipClass === "vpn") {
    push(signals, "DATACENTER_IP", input.ipClass);
  }
  if (input.automationHints >= 2) push(signals, "HEADLESS_SIGNATURE", `${input.automationHints} flags`);
  if (BOT_UA.test(input.userAgent)) push(signals, "BOT_USER_AGENT");
  if (!input.javascriptRan) push(signals, "NO_JAVASCRIPT");
  if (input.clicksLastHour >= 5) push(signals, "CLICK_FLOOD", `${input.clicksLastHour}/hr`);
  if (input.distinctVisitorsPerIp >= 25) {
    push(signals, "IP_FANOUT", `${input.distinctVisitorsPerIp} identities`);
  }
  if (input.javascriptRan && input.dwellMs < 2000) push(signals, "DWELL_TOO_SHORT", `${input.dwellMs}ms`);
  if (input.javascriptRan && input.interactions === 0) push(signals, "NO_INTERACTION");
  if (input.clickId && input.clickIdSeenBefore) push(signals, "REPEAT_CLICK_ID");
  if (
    input.targetCountry &&
    input.visitorCountry &&
    input.visitorCountry.toUpperCase() !== input.targetCountry.toUpperCase()
  ) {
    push(signals, "GEO_MISMATCH", `${input.visitorCountry} ≠ ${input.targetCountry}`);
  }
  if (input.visitorCountry && input.timezoneOffsetMinutes !== null) {
    const allowed = COUNTRY_OFFSETS[input.visitorCountry.toUpperCase()];
    if (allowed && !allowed.includes(input.timezoneOffsetMinutes)) push(signals, "TIMEZONE_MISMATCH");
  }
  if (input.clickId && !input.referrerHost) push(signals, "MISSING_REFERRER");
  if (input.minutesSinceDistantHop !== null && input.minutesSinceDistantHop <= 5) {
    push(signals, "IMPOSSIBLE_SPEED", `${input.minutesSinceDistantHop}m`);
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  const decisive = signals.find((s) => SIGNAL_BY_CODE.get(s.code)?.decisive) ?? null;

  let verdict: AdVerdict = "valid";
  if (decisive || score >= INVALID_THRESHOLD) verdict = "invalid";
  else if (score >= SUSPICIOUS_THRESHOLD) verdict = "suspicious";

  return {
    score,
    verdict,
    signals: signals.sort((a, b) => b.weight - a.weight),
    decisiveCode: decisive?.code ?? null,
    engineVersion: AD_FRAUD_ENGINE_VERSION,
  };
}

/**
 * Rolls a visitor's clicks over a day into one intent score. Fake-visitor
 * detection is the mirror of click scoring: repeated invalid clicks and zero
 * commerce intent (no product view, no cart) means a fake visitor even when
 * every single click looked merely "suspicious".
 */
export type VisitorInput = {
  clicks: number;
  invalidClicks: number;
  suspiciousClicks: number;
  productViews: number;
  cartAdds: number;
  orders: number;
  medianDwellMs: number;
  distinctCampaigns: number;
};

export type VisitorScore = {
  /** 0-100, higher means more likely fake. */
  fakeScore: number;
  /** 0-100 commercial intent; the inverse view the merchant actually buys. */
  intentScore: number;
  verdict: AdVerdict;
  reasons: string[];
};

export function scoreVisitor(input: VisitorInput): VisitorScore {
  const clicks = Math.max(0, input.clicks);
  const reasons: string[] = [];
  let fake = 0;

  if (clicks > 0) {
    const invalidShare = input.invalidClicks / clicks;
    const suspiciousShare = input.suspiciousClicks / clicks;
    fake += Math.round(invalidShare * 55 + suspiciousShare * 25);
    if (invalidShare >= 0.5) reasons.push("INVALID_MAJORITY");
  }
  if (clicks >= 8 && input.productViews === 0) {
    fake += 20;
    reasons.push("CLICKS_WITHOUT_BROWSING");
  }
  if (input.medianDwellMs > 0 && input.medianDwellMs < 1500) {
    fake += 15;
    reasons.push("BOUNCE_PATTERN");
  }
  if (input.distinctCampaigns >= 4 && input.orders === 0) {
    fake += 10;
    reasons.push("CAMPAIGN_SPRAY");
  }

  let intent = 0;
  intent += Math.min(30, input.productViews * 6);
  intent += Math.min(30, input.cartAdds * 15);
  intent += input.orders > 0 ? 40 : 0;
  if (input.medianDwellMs >= 8000) intent += 10;

  fake = Math.max(0, Math.min(100, fake - (input.orders > 0 ? 60 : 0)));
  intent = Math.max(0, Math.min(100, intent));

  const verdict: AdVerdict = fake >= INVALID_THRESHOLD ? "invalid" : fake >= SUSPICIOUS_THRESHOLD ? "suspicious" : "valid";
  return { fakeScore: fake, intentScore: intent, verdict, reasons };
}

/* ------------------------------------------------------------------ */
/* Attribution integrity                                               */
/* ------------------------------------------------------------------ */

export type CampaignDayInput = {
  network: AdNetwork;
  campaign: string;
  day: string;
  clicks: number;
  invalidClicks: number;
  suspiciousClicks: number;
  conversions: number;
  /** Conversions whose last click was scored invalid — poisoned attribution. */
  poisonedConversions: number;
  spendMinorInt: number;
  currencyCode: string;
};

export type CampaignIntegrity = CampaignDayInput & {
  /** Percentage of clicks refused attribution, one decimal. */
  invalidRate: number;
  /** Percentage of clicks quarantined, one decimal. */
  suspiciousRate: number;
  /** Spend attributable to refused clicks, integer minor units. */
  wastedSpendMinorInt: number;
  /** Cost per genuine click after fraud is removed. */
  trueCpcMinorInt: number;
  /** Reported CPC before fraud removal. */
  reportedCpcMinorInt: number;
  /** 0-100 trust in this campaign's reported numbers. */
  integrityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function grade(score: number): CampaignIntegrity["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Turns raw campaign-day counters into the attribution-integrity view: how much
 * of the reported performance is trustworthy, and how much money the fake half
 * consumed. Money stays in integer minor units end to end (§A rule 1).
 */
export function campaignIntegrity(row: CampaignDayInput): CampaignIntegrity {
  const clicks = Math.max(0, row.clicks);
  const invalid = Math.min(clicks, Math.max(0, row.invalidClicks));
  const suspicious = Math.min(clicks - invalid, Math.max(0, row.suspiciousClicks));
  const spend = Math.max(0, Math.trunc(row.spendMinorInt));
  const genuine = clicks - invalid;

  const invalidRate = clicks === 0 ? 0 : round1((invalid / clicks) * 100);
  const suspiciousRate = clicks === 0 ? 0 : round1((suspicious / clicks) * 100);
  const wasted = clicks === 0 ? 0 : Math.round((spend * invalid) / clicks);

  const conversions = Math.max(0, row.conversions);
  const poisoned = Math.min(conversions, Math.max(0, row.poisonedConversions));
  const poisonRate = conversions === 0 ? 0 : poisoned / conversions;

  const integrityScore = Math.max(
    0,
    Math.round(100 - invalidRate - suspiciousRate * 0.5 - poisonRate * 25),
  );

  return {
    ...row,
    clicks,
    invalidClicks: invalid,
    suspiciousClicks: suspicious,
    spendMinorInt: spend,
    conversions,
    poisonedConversions: poisoned,
    invalidRate,
    suspiciousRate,
    wastedSpendMinorInt: wasted,
    reportedCpcMinorInt: clicks === 0 ? 0 : Math.round(spend / clicks),
    trueCpcMinorInt: genuine === 0 ? 0 : Math.round((spend - wasted) / genuine),
    integrityScore,
    grade: grade(integrityScore),
  };
}

export type IntegritySummary = {
  clicks: number;
  invalidClicks: number;
  suspiciousClicks: number;
  spendMinorInt: number;
  wastedSpendMinorInt: number;
  invalidRate: number;
  integrityScore: number;
  grade: CampaignIntegrity["grade"];
  currencyCode: string;
  worstCampaign: { network: AdNetwork; campaign: string; wastedSpendMinorInt: number } | null;
};

/** Folds per-campaign integrity into the single headline a merchant reads. */
export function summarizeIntegrity(rows: CampaignIntegrity[], currencyCode = "BDT"): IntegritySummary {
  const totals = rows.reduce(
    (acc, r) => {
      acc.clicks += r.clicks;
      acc.invalidClicks += r.invalidClicks;
      acc.suspiciousClicks += r.suspiciousClicks;
      acc.spendMinorInt += r.spendMinorInt;
      acc.wastedSpendMinorInt += r.wastedSpendMinorInt;
      return acc;
    },
    { clicks: 0, invalidClicks: 0, suspiciousClicks: 0, spendMinorInt: 0, wastedSpendMinorInt: 0 },
  );

  const invalidRate = totals.clicks === 0 ? 0 : round1((totals.invalidClicks / totals.clicks) * 100);
  const suspiciousRate =
    totals.clicks === 0 ? 0 : round1((totals.suspiciousClicks / totals.clicks) * 100);
  const integrityScore = Math.max(0, Math.round(100 - invalidRate - suspiciousRate * 0.5));

  const worst = rows
    .filter((r) => r.wastedSpendMinorInt > 0)
    .sort((a, b) => b.wastedSpendMinorInt - a.wastedSpendMinorInt)[0];

  return {
    ...totals,
    invalidRate,
    integrityScore,
    grade: grade(integrityScore),
    currencyCode: rows[0]?.currencyCode ?? currencyCode,
    worstCampaign: worst
      ? { network: worst.network, campaign: worst.campaign, wastedSpendMinorInt: worst.wastedSpendMinorInt }
      : null,
  };
}

/**
 * Merchant-facing Bangla explainer. The merchant never sees raw weights — they
 * see what happened and what to do, ordered by how much it cost them.
 */
export function explainSignals(signals: FiredSignal[], lang: "bn" | "en" = "bn") {
  return signals
    .map((s) => {
      const def = SIGNAL_BY_CODE.get(s.code);
      if (!def) return null;
      return {
        code: s.code,
        title: lang === "bn" ? def.bn : def.en,
        detail: lang === "bn" ? def.fixBn : def.fixEn,
        weight: s.weight,
        note: s.detail ?? null,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => b.weight - a.weight);
}

/** Advice block shown above the report — plain Bangla, no jargon. */
export function integrityAdvice(summary: IntegritySummary, lang: "bn" | "en" = "bn") {
  if (summary.clicks === 0) {
    return lang === "bn"
      ? "এখনো কোনো অ্যাড ক্লিক আসেনি। ক্যাম্পেইন চালু হলে এখানে হিসাব দেখা যাবে।"
      : "No ad clicks yet. Numbers appear here once a campaign starts.";
  }
  if (summary.invalidRate >= 25) {
    return lang === "bn"
      ? "আপনার বিজ্ঞাপনের এক-চতুর্থাংশের বেশি ক্লিক নকল। অভিযুক্ত সোর্সগুলো ব্লক করুন এবং নেটওয়ার্কে রিফান্ড দাবি করুন।"
      : "Over a quarter of your clicks are fake. Block the flagged sources and file a refund claim with the network.";
  }
  if (summary.invalidRate >= 10) {
    return lang === "bn"
      ? "উল্লেখযোগ্য পরিমাণ নকল ক্লিক পাওয়া গেছে। টার্গেটিং সংকীর্ণ করুন এবং ফ্ল্যাগ করা সোর্স ব্লক করুন।"
      : "A meaningful share of clicks is fake. Narrow targeting and block the flagged sources.";
  }
  return lang === "bn"
    ? "আপনার ক্লিকের মান ভালো আছে। নিয়মিত নজর রাখুন।"
    : "Your click quality looks healthy. Keep monitoring.";
}
