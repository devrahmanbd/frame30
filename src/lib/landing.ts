/**
 * Phase 10.2 — landing page domain rules (pure, no DOM, no network).
 *
 * Everything on `/` that could possibly be *wrong in public* lives here so it
 * can be unit-tested: which numbers we are allowed to print, how a "from"
 * price is chosen out of the plan matrix, what the comparison table claims,
 * and which FAQ rows feed the FAQPage schema in §10.5.
 *
 * Two rules drive the whole module:
 *
 *   1. **Never invent a number.** A metric is rendered only when it comes from
 *      the database *and* clears a floor where the rounded figure is still
 *      honest. Below the floor we print the qualitative label instead of a
 *      humiliating "3 merchants".
 *   2. **Never hardcode a price.** The teaser reads `plan_definitions`; if the
 *      matrix is empty or every price is null, the teaser degrades to a link
 *      to `/pricing` rather than a made-up figure.
 */

/* ------------------------------------------------------------------ stats */

export type RawStats = {
  /** Active, verified merchants. */
  merchants: number | null;
  /** Published, non-deleted products across the platform. */
  products: number | null;
  /** Published articles across the platform. */
  articles: number | null;
  /** Payment rails wired end to end (from the payment-rail registry). */
  paymentRails: number | null;
  /** ISO timestamp the figures were read at. */
  measuredAt: string;
};

export type StatKey = keyof Omit<RawStats, "measuredAt">;

export type PublishedStat = {
  key: StatKey;
  /** The value we are willing to print (rounded *down*, never up). */
  value: number;
  /** `+` when the display value was floored below the true value. */
  approximate: boolean;
  /** Unit suffix, e.g. "+". */
  suffix: string;
};

/**
 * Minimum true value before a metric may appear at all. A young platform that
 * brags about 4 merchants loses more trust than one that stays quiet.
 */
export const STAT_FLOOR: Record<StatKey, number> = {
  merchants: 10,
  products: 50,
  articles: 3,
  paymentRails: 2};

/**
 * Rounding steps. We always round *down* to the step, so the printed number is
 * a claim we can defend in a screenshot: "500+" with 512 real rows is true;
 * "500+" with 480 is not.
 */
export const STAT_STEP: Record<StatKey, number> = {
  merchants: 10,
  products: 50,
  articles: 1,
  paymentRails: 1};

export function floorToStep(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0 || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

/**
 * Turn raw counts into the list the numbers band may render. Order is stable
 * (declaration order), unpublishable metrics are dropped entirely rather than
 * rendered as zero — an empty band is hidden by the component.
 */
export function publishableStats(raw: RawStats): PublishedStat[] {
  const keys: StatKey[] = ["merchants", "products", "paymentRails", "articles"];
  const out: PublishedStat[] = [];
  for (const key of keys) {
    const actual = raw[key];
    if (actual == null || !Number.isFinite(actual)) continue;
    if (actual < STAT_FLOOR[key]) continue;
    const step = STAT_STEP[key];
    const shown = floorToStep(actual, step);
    if (shown <= 0) continue;
    out.push({
      key,
      value: shown,
      approximate: shown < actual,
      suffix: shown < actual ? "+" : ""});
  }
  return out;
}

/* ------------------------------------------------------------------ pricing */

export type PlanTeaserInput = {
  plan: string;
  titleEn: string;
  titleBn: string;
  priceMinorInt: number | null;
  currencyCode: string;
  trialDays: number;
  productsLimit: number;
  staffLimit: number;
};

export type PlanTeaser = {
  /** Cheapest plan that carries a real, non-null, positive price. */
  entry: PlanTeaserInput | null;
  /** Longest trial offered by any active plan — the CTA promise. */
  trialDays: number | null;
  /** Number of active plans, for "4 plans, no setup fee" style copy. */
  planCount: number;
  /** True when the matrix loaded but no plan carries a price. */
  priceUnavailable: boolean;
};

export function planTeaser(plans: readonly PlanTeaserInput[]): PlanTeaser {
  const priced = plans
    .filter((p) => typeof p.priceMinorInt === "number" && (p.priceMinorInt as number) > 0)
    .sort((a, b) => (a.priceMinorInt as number) - (b.priceMinorInt as number));
  const trials = plans.map((p) => p.trialDays).filter((d) => Number.isFinite(d) && d > 0);
  return {
    entry: priced[0] ?? null,
    trialDays: trials.length > 0 ? Math.max(...trials) : null,
    planCount: plans.length,
    priceUnavailable: plans.length > 0 && priced.length === 0};
}

/* --------------------------------------------------------------- proof rail */

/**
 * The proof strip. Only rails the platform actually settles money through, and
 * only names we are licensed to say. No invented merchant logos ever go here —
 * that is a legal problem, not a design decision.
 */
export const PROOF_RAILS = [
  { id: "bkash", label: "bKash", kind: "wallet" },
  { id: "nagad", label: "Nagad", kind: "wallet" },
  { id: "rocket", label: "Rocket", kind: "wallet" },
  { id: "cod", labelKey: "home.badge.cod", kind: "offline" },
  { id: "bank", labelKey: "home.rail.bank", kind: "bank" },
  { id: "pos", labelKey: "home.rail.pos", kind: "offline" },
] as const;

export type ProofRail = (typeof PROOF_RAILS)[number];

/* ----------------------------------------------------------- product tour */

export type TourStop = {
  id: "builder" | "catalog" | "orders" | "pos" | "payments";
  /** Dictionary keys — copy lives in the i18n dictionary, never inline. */
  titleKey: string;
  bodyKey: string;
  bulletKeys: readonly string[];
  /** Route the "see it" link points at; must exist in the router. */
  href: "/features" | "/pricing" | "/docs";
};

export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: "builder",
    titleKey: "home.tour.builder.title",
    bodyKey: "home.tour.builder.body",
    bulletKeys: ["home.tour.builder.b1", "home.tour.builder.b2", "home.tour.builder.b3"],
    href: "/features"},
  {
    id: "catalog",
    titleKey: "home.tour.catalog.title",
    bodyKey: "home.tour.catalog.body",
    bulletKeys: ["home.tour.catalog.b1", "home.tour.catalog.b2", "home.tour.catalog.b3"],
    href: "/features"},
  {
    id: "orders",
    titleKey: "home.tour.orders.title",
    bodyKey: "home.tour.orders.body",
    bulletKeys: ["home.tour.orders.b1", "home.tour.orders.b2", "home.tour.orders.b3"],
    href: "/features"},
  {
    id: "pos",
    titleKey: "home.tour.pos.title",
    bodyKey: "home.tour.pos.body",
    bulletKeys: ["home.tour.pos.b1", "home.tour.pos.b2", "home.tour.pos.b3"],
    href: "/features"},
  {
    id: "payments",
    titleKey: "home.tour.payments.title",
    bodyKey: "home.tour.payments.body",
    bulletKeys: ["home.tour.payments.b1", "home.tour.payments.b2", "home.tour.payments.b3"],
    href: "/pricing"},
] as const;

/* ------------------------------------------------------------- comparison */

export type ComparisonRow = {
  id: string;
  labelKey: string;
  /** What a Facebook-page + spreadsheet seller does today. */
  statusQuoKey: string;
  /** What Framique does. Must be a shipped capability, not a roadmap item. */
  framiqueKey: string;
};

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { id: "catalog", labelKey: "home.cmp.catalog", statusQuoKey: "home.cmp.catalog.sq", framiqueKey: "home.cmp.catalog.fq" },
  { id: "orders", labelKey: "home.cmp.orders", statusQuoKey: "home.cmp.orders.sq", framiqueKey: "home.cmp.orders.fq" },
  { id: "payments", labelKey: "home.cmp.payments", statusQuoKey: "home.cmp.payments.sq", framiqueKey: "home.cmp.payments.fq" },
  { id: "seo", labelKey: "home.cmp.seo", statusQuoKey: "home.cmp.seo.sq", framiqueKey: "home.cmp.seo.fq" },
  { id: "staff", labelKey: "home.cmp.staff", statusQuoKey: "home.cmp.staff.sq", framiqueKey: "home.cmp.staff.fq" },
  { id: "data", labelKey: "home.cmp.data", statusQuoKey: "home.cmp.data.sq", framiqueKey: "home.cmp.data.fq" },
] as const;

/* -------------------------------------------------------------------- FAQ */

export type FaqRow = { id: string; questionKey: string; answerKey: string };

/** Also the source for the FAQPage JSON-LD in §10.5 — keep answers factual. */
export const FAQ_ROWS: readonly FaqRow[] = [
  { id: "trial", questionKey: "home.faq.trial.q", answerKey: "home.faq.trial.a" },
  { id: "payments", questionKey: "home.faq.payments.q", answerKey: "home.faq.payments.a" },
  { id: "bangla", questionKey: "home.faq.bangla.q", answerKey: "home.faq.bangla.a" },
  { id: "domain", questionKey: "home.faq.domain.q", answerKey: "home.faq.domain.a" },
  { id: "export", questionKey: "home.faq.export.q", answerKey: "home.faq.export.a" },
  { id: "support", questionKey: "home.faq.support.q", answerKey: "home.faq.support.a" },
] as const;

/* ------------------------------------------------------------ landing data */

export type StoryCard = {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  merchantName: string | null;
};

export type LandingData = {
  plans: PlanTeaserInput[];
  stats: RawStats;
  stories: StoryCard[];
  demoSlug: string | null;
  /** True when any sub-read fell back; the page still renders in full. */
  degraded: boolean;
};

export const LANDING_LIMITS = {
  /** Case-study cards rendered; more would push the LCP section below budget. */
  stories: 3,
  /** Hard ceiling on rows any landing query may scan. */
  statScan: 1,
  /** Cache freshness for the whole landing payload. */
  ttlSeconds: 300,
  staleSeconds: 900,
  timeoutMs: 2500} as const;

export const EMPTY_LANDING: LandingData = {
  plans: [],
  stats: { merchants: null, products: null, articles: null, paymentRails: null, measuredAt: "" },
  stories: [],
  
  degraded: true};
