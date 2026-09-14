/**
 * Phase 10.1 exit gate — the band kit's visual smoke surface.
 *
 * Why this route exists: the band kit is the substrate for eleven public pages,
 * so a regression in `Band`'s rhythm or `MatrixTable`'s overflow behaviour is
 * an eleven-page regression. Reviewing it through a marketing page hides the
 * defect behind that page's copy; reviewing it here shows every primitive, in
 * every configuration, on one scroll.
 *
 * Two deliberate choices:
 *
 * 1. Content is realistic, not lorem. A band that only ever renders "Card
 *    title" never reveals that a two-line heading breaks the 60/40 row, and a
 *    band that never renders Bangla never reveals a clipped matra. Every
 *    primitive below carries one long English string and one Bangla string in a
 *    `lang="bn"` subtree, which is exactly what `scripts/responsive-sweep.mjs`
 *    measures at 320 → 1920px.
 * 2. It is unindexable and unlinked. `noindex, nofollow` plus absence from the
 *    marketing SEO registry and the sitemap graph means the crawler never sees
 *    a page with a dozen H2s and no purpose. It is a developer surface, so it
 *    is reachable by URL only.
 *
 * This route intentionally does NOT use `PublicShell`: the shell's header and
 * footer are themselves under review elsewhere, and wrapping the smoke page in
 * them would make a shell bug look like a band bug.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  Band,
  BandHeading,
  CardGrid,
  Chip,
  CtaBand,
  FaqBand,
  HeroBand,
  MarqueeBand,
  MatrixTable,
  SpotlightBand,
  StatBand,
  ZRow,
  type BandCard,
  type BandStat,
  type FaqEntry,
  type MarqueeMark,
  type MatrixColumn,
  type MatrixRow,
} from "@/components/public/bands";

export const Route = createFileRoute("/dev/bands")({
  head: () => ({
    meta: [
      { title: "Band kit — visual smoke (internal)" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Internal review surface that renders every marketing band primitive with realistic English and Bangla content.",
      },
    ],
  }),
  component: BandSmoke,
});

/**
 * A Bangla paragraph long enough to wrap. Bangla needs its own specimen
 * because the latin display face runs negative tracking and a 1.2 line box;
 * both clip matras, and both are only visible on wrapped multi-line text.
 */
const BN_BODY =
  "বিকাশ, নগদ, কার্ড আর ক্যাশ-অন-ডেলিভারি — প্রতিটি পেমেন্ট রেল এক জায়গায় মিলিয়ে দেখা যায়, তাই দিনের শেষে হিসাব মেলাতে আলাদা খাতা লাগে না।";
const BN_SHORT = "বাংলায় দোকান চালান";

/** Shared class for every Bangla subtree on this page. */
const BN = "font-bangla text-muted-foreground [letter-spacing:0] leading-[1.5]";

const MARKS: MarqueeMark[] = [
  { id: "bkash", content: "bKash", label: "bKash" },
  { id: "nagad", content: "Nagad", label: "Nagad" },
  { id: "rocket", content: "Rocket", label: "Rocket" },
  { id: "upay", content: "Upay", label: "Upay" },
  { id: "cod", content: "Cash on delivery", label: "Cash on delivery" },
  { id: "card", content: "Card", label: "Card" },
  // A Bangla mark is included on purpose: the marquee clones its track, so a
  // taller glyph box here is what exposes a vertical clip in the mask.
  { id: "bn", content: <span className={BN}>{BN_SHORT}</span>, label: "Run your shop in Bangla" },
];

const CARDS: BandCard[] = [
  {
    id: "short",
    title: "Storefront builder",
    body: "Sections, not templates.",
  },
  {
    id: "long",
    // A three-line title is the realistic worst case for a card row: it is how
    // a plan name plus qualifier arrives from the database.
    title: "Reconciled payments across every mobile-money rail in Bangladesh",
    body: "Settlement files are parsed, matched against captured charges, and every variance is held for review rather than silently absorbed into the day's total.",
    meta: <Chip>Live</Chip>,
    footer: <span className="text-sm text-muted-foreground">Included on every plan</span>,
  },
  {
    id: "featured",
    title: "Growth",
    body: "For stores past their first thousand orders a month.",
    featured: true,
    featuredLabel: "Most chosen",
    footer: <span className="fq-display text-2xl">৳ 2,900</span>,
  },
  {
    id: "bangla",
    title: <span className={BN}>বাংলা ক্যাটালগ</span>,
    body: <span className={BN}>{BN_BODY}</span>,
  },
];

const MATRIX_COLUMNS: MatrixColumn[] = [
  { id: "launch", label: "Launch" },
  { id: "growth", label: "Growth", highlight: true },
  { id: "business", label: "Business" },
  { id: "enterprise", label: "Enterprise", align: "right" },
];

const MATRIX_ROWS: MatrixRow[] = [
  {
    id: "rails",
    label: "Mobile-money rails",
    cells: { launch: "bKash", growth: "All rails", business: "All rails", enterprise: "All rails" },
  },
  {
    id: "long-label",
    // Long row labels are the usual cause of horizontal overflow at 320px.
    label: "Settlement variance alerts with reviewer assignment and audit trail",
    cells: { launch: "—", growth: "Included", business: "Included", enterprise: "Included" },
  },
  {
    id: "bangla",
    label: <span className={BN}>বাংলা ইনভয়েস</span>,
    cells: {
      launch: "Included",
      growth: "Included",
      business: "Included",
      enterprise: "Included",
    },
  },
];

const STATS: BandStat[] = [
  { id: "orders", label: "Orders processed", value: 128_400, suffix: "+" },
  { id: "uptime", label: "Rolling 30-day uptime", value: 99.95, suffix: "%", decimals: 2 },
  // A null stat must render as an honest dash, never as a zero — the whole
  // point of the `value: null` branch is that we omit rather than invent.
  { id: "missing", label: "Metric not yet measured", value: null, hint: "Awaiting first full month" },
  {
    id: "bangla",
    label: <span className={BN}>সক্রিয় দোকান</span>,
    value: 312,
    hint: <span className={BN}>গত ত্রিশ দিনে</span>,
  },
];

const FAQ: FaqEntry[] = [
  {
    id: "q1",
    question: "Does a long question wrap cleanly against the disclosure marker on a narrow phone?",
    answer:
      "It has to. The summary row is a flex row with a fixed marker, so an unbounded question string is the case that pushes the marker off-canvas if the row ever loses its min-width-0 child.",
  },
  {
    id: "q2",
    question: <span className={BN}>বাংলা প্রশ্ন কীভাবে দেখায়?</span>,
    answer: <span className={BN}>{BN_BODY}</span>,
  },
];

function VisualStub({ label }: { label: string }) {
  // Bands take an arbitrary `visual` node. The smoke page passes a labelled
  // placeholder with a real aspect ratio so a row's 60/40 split is measurable
  // without pulling in page-specific artwork.
  return (
    <div className="fq-glass flex aspect-[4/3] items-center justify-center rounded-fq-lg text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function BandSmoke() {
  return (
    <main className="fq-site min-h-screen bg-background text-foreground">
      {/* The only H1 on the page, exactly as a marketing route would have it. */}
      <HeroBand
        eyebrow="Internal · Phase 10.1"
        title="Every band primitive, one scroll, realistic content."
        titleBn={<span className={BN}>প্রতিটি ব্যান্ড, এক স্ক্রলে</span>}
        sub="If a primitive breaks at 320px, clips a Bangla matra, or drifts off the 112/72 rhythm, it breaks here first — before it reaches a public page."
        subBn={<span className={BN}>{BN_BODY}</span>}
        actions={
          <>
            <span className="fq-glass rounded-fq-md px-5 py-3 text-sm font-semibold">
              Primary action
            </span>
            <span className="rounded-fq-md border border-border px-5 py-3 text-sm font-semibold">
              Secondary action
            </span>
          </>
        }
        proof={<Chip>Not indexed · not linked</Chip>}
        visual={<VisualStub label="Hero visual slot" />}
      />

      <MarqueeBand
        kicker="Marquee — logo rail"
        marks={MARKS}
        label="Supported payment rails"
        note="Reduced motion stops the track and falls back to a static wrapped list."
      />

      {/* Z rows alternate direction; rendering both here is what proves the
          alternation is a prop and not a per-page override. */}
      <Band divided labelledBy="z-heading">
        <BandHeading
          id="z-heading"
          eyebrow="ZRow"
          title="Deep-dive rows, both directions"
          sub="One claim, one proof, one still per row."
        />
        <div className="mt-12 space-y-16">
          <ZRow
            direction="left"
            level={3}
            eyebrow="Text left"
            title="A row title that runs long enough to wrap onto a second line"
            body="The 60/40 split holds because the text column is a min-width-0 grid child; without that, a long unbroken token in the body would widen the row past the container."
            proof={<Chip>Proof chip</Chip>}
            bullets={["First supporting point", "Second supporting point", "Third supporting point"]}
            action={<span className="text-sm font-semibold text-primary">Inline action</span>}
            visual={<VisualStub label="Row visual" />}
          />
          <ZRow
            direction="right"
            level={3}
            eyebrow="Text right"
            title={<span className={BN}>বাংলা শিরোনাম সহ সারি</span>}
            body={<span className={BN}>{BN_BODY}</span>}
            visual={<VisualStub label="Row visual" />}
          />
        </div>
      </Band>

      <Band surface="aurora" labelledBy="cards-heading">
        <BandHeading
          id="cards-heading"
          eyebrow="CardGrid"
          title="Comparable things, one grid"
          sub="Short title, three-line title, one featured card, and a Bangla card — the four cases that break a card row."
        />
        <div className="mt-12 space-y-10">
          <CardGrid cards={CARDS} columns={4} />
          <CardGrid cards={CARDS.slice(0, 2)} columns={2} level={4} />
        </div>
      </Band>

      <Band divided labelledBy="matrix-heading">
        <BandHeading
          id="matrix-heading"
          eyebrow="MatrixTable"
          title="Comparison matrices scroll, they never squeeze"
        />
        <MatrixTable
          className="mt-12"
          caption="Plan capability matrix used as the overflow specimen"
          columns={MATRIX_COLUMNS}
          rows={MATRIX_ROWS}
          stickyHeader
          note="Below the table's minimum width the wrapper scrolls horizontally; the page itself must not."
        />
      </Band>

      <Band labelledBy="stats-heading">
        <BandHeading
          id="stats-heading"
          eyebrow="StatBand"
          title="Live figures, and the honest absence of one"
        />
        <StatBand className="mt-12" stats={STATS} columns={4} />
      </Band>

      <Band divided labelledBy="spotlight-heading">
        <BandHeading id="spotlight-heading" eyebrow="SpotlightBand" title="The one gradient tile" />
        <div className="mt-12">
          <SpotlightBand
            level={3}
            eyebrow="Spotlight"
            title="Scarce chroma: at most one of these per page"
            body="A second spotlight halves the weight of the first, which is the entire reason the tile earns attention at all."
            actions={
              <span className="fq-glass rounded-fq-md px-5 py-3 text-sm font-semibold">
                Primary action
              </span>
            }
            aside={<p className={`max-w-xs text-sm ${BN}`}>{BN_BODY}</p>}
          />
        </div>
      </Band>

      <Band labelledBy="faq-heading">
        <BandHeading
          id="faq-heading"
          eyebrow="FaqBand"
          title="Native disclosure rows"
          sub="Answers are in the DOM before hydration, so a crawler and a keyboard user get the same thing."
        />
        <FaqBand entries={FAQ} />
      </Band>

      <CtaBand
        title="Closing band, spotlight tone"
        body="One primary action, one low-commitment alternative, one risk-reversal note. Never two primaries."
        primary={
          <span className="fq-glass rounded-fq-md px-5 py-3 text-sm font-semibold">
            Primary action
          </span>
        }
        secondary={
          <span className="rounded-fq-md border border-border px-5 py-3 text-sm font-semibold">
            Secondary action
          </span>
        }
        note="Risk-reversal line goes here."
      />

      <CtaBand
        tone="glass"
        title="Closing band, glass tone"
        body="Used by pages that already spent their one spotlight higher up the scroll."
        primary={
          <span className="fq-glass rounded-fq-md px-5 py-3 text-sm font-semibold">
            Primary action
          </span>
        }
        note={<span className={BN}>{BN_SHORT}</span>}
      />
    </main>
  );
}
