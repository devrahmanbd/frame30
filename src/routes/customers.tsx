/**
 * `/customers` — proof-of-platform, not a hype reel.
 *
 * The copy deck's integrity rule is enforced here at the render boundary, not
 * just in prose: every "story" on this page is a row from the live
 * `articles` table (via `getLanding`), and every number in the proof band is
 * a live platform count run through `publishableStats` (the same floor/step
 * rounding the home page uses, so a young number never gets flattered by
 * rounding up). There is no local mock data — when the loader comes back
 * empty, the page says so, in the deck's own words, instead of drawing a
 * templated card.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { getLanding } from "@/lib/landing.functions";
import { buildMarketingHead, buildGraph } from "@/lib/marketing-seo";
import { publishableStats, type StoryCard } from "@/lib/landing";
import { useLang } from "@/lib/i18n";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";
import { MarketingPlaceholderImage } from "@/components/public/MarketingPlaceholderImage";
import {
  Band,
  BandHeading,
  Chip,
  HeroBand,
  CardGrid,
  ZRow,
  MatrixTable,
  StatBand,
  SpotlightBand,
  FaqBand,
  CtaBand,
  type BandCard,
  type BandStat} from "@/components/public/bands";
import {
  HERO,
  PROOF_STANDARD,
  STORY_SECTION,
  ARCHETYPES,
  ARCHETYPES_INTRO,
  METRIC_DEFINITIONS,
  METRIC_DEFINITIONS_INTRO,
  CASE_STUDY_GUIDE,
  PROOF_OF_PLATFORM,
  SUBMIT_STORY,
  FAQ,
  FINAL_CTA} from "@/lib/marketing/customers.content";

export const Route = createFileRoute("/customers")({
  loader: async () => {
    // Both reads are already fail-soft (`renderRead` inside each), but the
    // route loader adds a second guard: a public marketing page must never
    // 500 because a sub-fetch above it changed shape.
    try {
      const [site, landing] = await Promise.all([getSiteContext(), getLanding()]);
      return {
        origin: site.origin,
        
        stories: landing.stories,
        stats: landing.stats};
    } catch {
      return { origin: null,  stories: [] as StoryCard[], stats: null };
    }
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const stories = loaderData?.stories ?? [];

    // The deck's JSON-LD contract for this route is BreadcrumbList + an
    // ItemList of published stories — and explicitly *no* Review or
    // AggregateRating node until a real, verified review corpus exists.
    // `customers` is registered with schema ["BreadcrumbList", "CollectionPage"]
    // in the SEO registry, so BreadcrumbList/CollectionPage come from
    // `buildGraph` automatically; the ItemList is story-specific and rides in
    // as an extra node, built only from stories the page actually renders.
    const itemList =
      origin && stories.length > 0
        ? {
            "@type": "ItemList",
            "@id": `${origin}/customers#stories`,
            itemListElement: stories.map((story, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: `${origin}/blog/${story.slug}`,
              name: story.title,
              ...(story.coverImageUrl ? { image: story.coverImageUrl } : {})}))}
        : null;

    const head = buildMarketingHead({
      route: "customers",
      origin,
      extraSchema: itemList ? [itemList] : []});
    return { meta: head.meta, links: head.links, scripts: head.scripts };
  },
  errorComponent: () => <CustomersMessage titleEn="Could not load customer stories" titleBn="গ্রাহকদের গল্প লোড করা যায়নি" />,
  notFoundComponent: () => <CustomersMessage titleEn="Page not found" titleBn="পেজটি পাওয়া যায়নি" />,
  component: CustomersPage});

function CustomersMessage({ titleEn, titleBn }: { titleEn: string; titleBn: string }) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="fq-display text-2xl font-semibold">{t(titleEn, titleBn)}</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}

function CustomersPage() {
  const { t, lang } = useLang();
  const { stories, stats  } = Route.useLoaderData();

  const featured = stories[0] ?? null;
  const rest = stories.slice(1);

  // Live, floor-rounded counters — the exact function the home page's
  // numbers band uses, so a claim on this page and a claim on `/` can never
  // silently drift apart.
  const published = stats ? publishableStats(stats) : [];
  const STAT_LABEL: Record<string, Bilingual2> = {
    merchants: { en: "Verified merchants live", bn: "সক্রিয় যাচাইকৃত মার্চেন্ট" },
    products: { en: "Products live on Framique", bn: "সক্রিয় পণ্য" },
    articles: { en: "Published stories & guides", bn: "প্রকাশিত গল্প ও গাইড" },
    paymentRails: { en: "Payment rails settled end to end", bn: "সম্পূর্ণ পেমেন্ট মাধ্যম" }};
  const bandStats: BandStat[] = published.map((stat) => ({
    id: stat.key,
    label: t(STAT_LABEL[stat.key].en, STAT_LABEL[stat.key].bn),
    value: null,
    display: `${stat.value}${stat.suffix}`}));

  const proofCards: BandCard[] = PROOF_STANDARD.commitments.map((c) => ({
    id: c.id,
    title: c.title,
    body: (
      <>
        <p>{c.body}</p>
        <p className="mt-3 text-xs">
          <span className="font-medium">{t("Breaks it:", "যা এটি ভাঙে:")}</span> {c.breaks}
        </p>
      </>
    )}));

  const storyCards: BandCard[] = rest.map((story) => ({
    id: story.slug,
    title: story.title,
    body: story.excerpt ? <div className="fx-softblur">{story.excerpt}</div> : undefined,
    meta: story.merchantName ? (
      <span className="inline-flex items-center gap-1.5">
        <Chip>{story.merchantName}</Chip>
        <AnimatedIcon icon={CheckCircle2} variant="sparkle" size="sm" className="text-primary" />
      </span>
    ) : undefined,
    footer: (
      <Link to="/blog/$slug" params={{ slug: story.slug }} className="text-sm font-medium text-primary inline-flex items-center gap-1 group">
        <span>{STORY_SECTION.cardCta}</span>
        <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
      </Link>
    )}));

  return (
    <PublicShell >
      <HeroBand
        eyebrow={t(HERO.eyebrow.en, HERO.eyebrow.bn)}
        title={HERO.title}
        titleBn={HERO.titleBn}
        sub={HERO.sub}
        subBn={HERO.subBn}
        actions={
          <>
            <a
              href="#stories"
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2 shadow-sm hover:bg-primary/90 transition-all group"
            >
              <span>{t(HERO.ctaPrimary, "গল্পগুলো পড়ুন")}</span>
              <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
            </a>
            <Link
              to="/auth"
              search={{ mode: "signup", accountType: "merchant" }}
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
            >
              {t(HERO.ctaSecondary, "বিনামূল্যে শুরু করুন")}
            </Link>
          </>
        }
      />

      {/* 2 — The proof standard: procedural, not promotional, three equal cards. */}
      <Band divided labelledBy="proof-standard-title">
        <BandHeading
          id="proof-standard-title"
          eyebrow={PROOF_STANDARD.eyebrow}
          title={PROOF_STANDARD.title}
          sub={PROOF_STANDARD.sub}
        />
        <div className="mt-10">
          <CardGrid cards={proofCards} columns={3} />
        </div>
      </Band>

      {/* 3 & 4 — Featured story + grid, both sourced from live published articles. */}
      <Band as="div" divided id="stories" labelledBy="stories-title">
        <BandHeading
          id="stories-title"
          eyebrow={STORY_SECTION.eyebrow}
          title={STORY_SECTION.title}
          sub={STORY_SECTION.sub}
        />

        {stories.length === 0 ? (
          <p className="fq-glass fq-measure mt-10 rounded-fq-lg p-8 text-sm text-muted-foreground">
            {t(STORY_SECTION.emptyTitle, STORY_SECTION.emptyTitle)}
            <br />
            {STORY_SECTION.emptyBody}
          </p>
        ) : (
          <>
            {featured ? (
              <div className="mt-10">
                <SpotlightBand
                  level={3}
                  title={featured.title}
                  body={featured.excerpt ?? undefined}
                  aside={
                    featured.merchantName ? (
                      <p className="max-w-xs text-sm opacity-85">{featured.merchantName}</p>
                    ) : undefined
                  }
                  actions={
                    <Link
                      to="/blog/$slug"
                      params={{ slug: featured.slug }}
                      className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-fq-md bg-background px-5 py-3 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/30 transition-all"
                    >
                      {STORY_SECTION.cardCta}
                    </Link>
                  }
                />
              </div>
            ) : null}

            {storyCards.length > 0 ? (
              <div className="mt-10">
                <CardGrid cards={storyCards} columns={3} />
              </div>
            ) : null}
          </>
        )}
      </Band>

      {/* Verified metrics — live, floor-rounded counts, never an invented figure. */}
      {bandStats.length > 0 ? (
        <Band divided labelledBy="proof-of-platform-title">
          <BandHeading
            id="proof-of-platform-title"
            eyebrow={PROOF_OF_PLATFORM.eyebrow}
            title={PROOF_OF_PLATFORM.title}
            sub={PROOF_OF_PLATFORM.sub}
          />
          <div className="mt-10">
            <StatBand stats={bandStats} columns={4} />
          </div>
          <p className="fq-measure mt-6 text-sm text-muted-foreground">
            {PROOF_OF_PLATFORM.statusNote}{" "}
            <Link to="/status" className="font-medium text-primary underline">
              {PROOF_OF_PLATFORM.statusCta}
            </Link>
          </p>
        </Band>
      ) : null}

      {/* 5 — Segment archetypes: recognition, not attribution to a named merchant. */}
      <Band divided labelledBy="archetypes-title">
        <BandHeading
          id="archetypes-title"
          eyebrow={ARCHETYPES_INTRO.eyebrow}
          title={ARCHETYPES_INTRO.title}
          sub={ARCHETYPES_INTRO.sub}
        />
        <div className="mt-4 divide-y divide-border">
          {ARCHETYPES.map((archetype, index) => (
            <ZRow
              key={archetype.id}
              id={`archetype-${archetype.id}`}
              direction={index % 2 === 0 ? "left" : "right"}
              title={archetype.segment}
              proof={`${archetype.theme} ${t("theme", "থিম")}`}
              visual={
                index === 0 ? (
                  <MarketingPlaceholderImage
                    alt="Prompt: Commercial photograph of a Bangladeshi female fashion boutique founder inspecting handcrafted Jamdani sarees in an elegant Dhaka showroom with soft ambient lighting, high-end textile studio, shot on Hasselblad 80mm lens, photorealistic, 8k resolution, aspect ratio 16:9."
                    aspect="16/9"
                    badge={t("Apparel & Jamdani", "ফ্যাশন ও জামদানি")}
                    caption={t("Handcrafted fashion studio in Banani, Dhaka.", "বনানী, ঢাকায় অবস্থিত হ্যান্ডক্রাফটেড ফ্যাশন স্টুডিও।")}
                  />
                ) : index === 1 ? (
                  <MarketingPlaceholderImage
                    alt="Prompt: A young energetic Bangladeshi merchant in a modern Dhaka tech accessories warehouse packing premium wireless earbuds into branded mailer boxes, dual monitors in background displaying Framique order dispatch screen, authentic studio lighting, 8k resolution, aspect ratio 16:9."
                    aspect="16/9"
                    badge={t("Consumer Tech", "কনজিউমার টেক")}
                    caption={t("Fast-dispatch consumer accessories hub in Tejgaon, Dhaka.", "তেজগাঁও, ঢাকায় অবস্থিত কনজিউমার এক্সেসরিজ ডিসপ্যাচ হাব।")}
                  />
                ) : undefined
              }
              body={
                <>
                  <span className="block">{archetype.aov}</span>
                  <span className="mt-1 block">{archetype.catalogue}</span>
                  <span className="mt-1 block">{archetype.codShare}</span>
                </>
              }
              bullets={[
                <>
                  <span className="font-medium text-foreground">{t("Typical failure modes: ", "সাধারণ ব্যর্থতার ধরন: ")}</span>
                  {archetype.failureModes.join(" · ")}
                </>,
                <>
                  <span className="font-medium text-foreground">{t("Metrics that matter: ", "গুরুত্বপূর্ণ মেট্রিক্স: ")}</span>
                  {archetype.metrics.join(" · ")}
                </>,
                archetype.plan,
              ]}
              action={
                <p lang="bn" className="font-bangla fq-measure text-sm text-muted-foreground">
                  {archetype.bnNote}
                </p>
              }
            />
          ))}
        </div>
      </Band>

      {/* 6 — Metric definitions: reference material, not marketing. */}
      <Band divided labelledBy="metrics-title">
        <BandHeading
          id="metrics-title"
          eyebrow={METRIC_DEFINITIONS_INTRO.eyebrow}
          title={METRIC_DEFINITIONS_INTRO.title}
          sub={METRIC_DEFINITIONS_INTRO.sub}
        />
        <div className="mt-10">
          <MatrixTable
            caption={METRIC_DEFINITIONS_INTRO.title}
            layout="cards"
            columns={[
              { id: "formula", label: t("Formula", "ফর্মুলা") },
              { id: "source", label: t("Dashboard source", "ড্যাশবোর্ড উৎস") },
              { id: "mistake", label: t("Common mistake", "সাধারণ ভুল") },
            ]}
            rows={METRIC_DEFINITIONS.map((row) => ({
              id: row.id,
              label: row.metric,
              cells: { formula: row.formula, source: row.source, mistake: row.mistake }}))}
          />
        </div>
      </Band>

      {/* 7 — How to write your own case study: a guide, not a promotion. */}
      <Band divided labelledBy="guide-title">
        <BandHeading
          id="guide-title"
          eyebrow={CASE_STUDY_GUIDE.eyebrow}
          title={CASE_STUDY_GUIDE.title}
          sub={CASE_STUDY_GUIDE.sub}
        />
        <ol className="fq-measure mt-10 space-y-6">
          {CASE_STUDY_GUIDE.steps.map((step, index) => (
            <li key={step.id} className="flex gap-4">
              <span className="fq-display shrink-0 text-lg text-muted-foreground">{index + 1}.</span>
              <div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="fq-glass mt-10 rounded-fq-lg p-6">
          <h3 className="text-base font-semibold">
            {t("A minimal self-audit checklist before you publish anything", "প্রকাশ করার আগে একটি ন্যূনতম স্ব-নিরীক্ষা চেকলিস্ট")}
          </h3>
          <ul role="list" className="mt-4 space-y-2 text-sm text-muted-foreground">
            {CASE_STUDY_GUIDE.checklist.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 text-primary">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* 9 — Submit your story: low-friction reciprocity, checklist shown up front. */}
      <CtaBand
        tone="glass"
        title={t(SUBMIT_STORY.title, SUBMIT_STORY.titleBn)}
        body={t(SUBMIT_STORY.sub, SUBMIT_STORY.subBn)}
        primary={
          <Link
            to="/contact"
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
          >
            {t(SUBMIT_STORY.ctaPrimary, "আপনার গল্প জমা দিন")}
          </Link>
        }
        secondary={
          <Link
            to="/auth"
            search={{ mode: "signup", accountType: "merchant" }}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted/30 transition-all"
          >
            {t(SUBMIT_STORY.ctaSecondary, "বিনামূল্যে শুরু করুন")}
          </Link>
        }
        note={
          <ul role="list" className="space-y-2 text-sm text-muted-foreground">
            {SUBMIT_STORY.checklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        }
      />

      {/* 10 — FAQ. No FAQPage schema on this route by design (see deck §SEO). */}
      <Band divided labelledBy="faq-title">
        <BandHeading id="faq-title" title={t("Frequently asked questions", "সাধারণ জিজ্ঞাসা")} />
        <FaqBand
          entries={FAQ.map((row) => ({ id: row.id, question: row.question, answer: row.answer }))}
        />
      </Band>

      {/* 11 — Final CTA: same restraint as the rest of the page, second and last gradient use. */}
      <CtaBand
        title={t(FINAL_CTA.title, FINAL_CTA.titleBn)}
        body={t(FINAL_CTA.sub, FINAL_CTA.subBn)}
        primary={
          <Link
            to="/auth"
            search={{ mode: "signup", accountType: "merchant" }}
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold flex items-center justify-center shadow-sm hover:bg-primary/90 transition-all"
          >
            {t(FINAL_CTA.primary, "বিনামূল্যে শুরু করুন")}
          </Link>
        }
        secondary={
          <Link
            to="/contact"
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
          >
            {t(FINAL_CTA.secondary, "সেলসের সাথে কথা বলুন")}
          </Link>
        }
      />
    </PublicShell>
  );
}

type Bilingual2 = { en: string; bn?: string };
