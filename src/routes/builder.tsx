/**
 * `/builder` — the storefront theme/section builder marketing page.
 *
 * Copy contract: docs/05-marketing/copy/04-builder.md. Content lives in
 * `src/lib/marketing/builder.content.ts` (pure data); this file only composes
 * the shared band kit around it and wires SEO/JSON-LD.
 *
 * Band order (per the deck / TODO §10.2):
 *   Hero · canvas mock (glass browser frame) · ZRow ×4 · lifecycle table ·
 *   five themes CardGrid + decision table · design tokens · bilingual
 *   catalogue · fonts/custom code · perf-budget MatrixTable · product-page
 *   checklist · first hour · comparison MatrixTable · accessibility ·
 *   FAQ (10) · CtaBand.
 *
 * The FAQ array is passed to both `<FaqBand>` and `buildGraph({ faq })` so the
 * rendered `<details>` text and the FAQPage JSON-LD never diverge.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LayoutGrid,
  SlidersHorizontal,
  History,
  ShieldCheck,
  Type as TypeIcon,
  Gauge,
  Globe2} from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead, buildGraph } from "@/lib/marketing-seo";
import { useLang } from "@/lib/i18n";
import {
  Band,
  BandHeading,
  Chip,
  HeroBand,
  ZRow,
  CardGrid,
  MatrixTable,
  FaqBand,
  CtaBand} from "@/components/public/bands";
import {
  hero,
  canvasMock,
  editingRows,
  lifecycle,
  themes,
  themeDecisionTable,
  tokensBand,
  bilingualCatalogue,
  fontsAndCode,
  perfBand,
  productPageChecklist,
  firstHour,
  comparison,
  accessibility,
  faq,
  cta} from "@/lib/marketing/builder.content";

export const Route = createFileRoute("/builder")({
  // Fail-soft: getSiteContext never throws (renderRead handles caching/
  // timeouts), so this loader cannot fail the route render.
  loader: async () => getSiteContext(),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const head = buildMarketingHead({ route: "builder", origin });
    // Same FAQ strings the FaqBand renders — a mismatch here is a spam signal
    // to search engines, so there is exactly one source array for both.
    const graph = buildGraph({
      route: "builder",
      origin,
      faq: faq.map((entry) => ({ question: entry.question, answer: entry.answer }))});
    return {
      meta: head.meta,
      links: head.links,
      scripts: graph ? [{ type: "application/ld+json", children: JSON.stringify(graph) }] : []};
  },
  errorComponent: () => <BuilderMessage titleEn="Could not load this page" titleBn="পেজটি লোড করা যায়নি" />,
  notFoundComponent: () => <BuilderMessage titleEn="Page not found" titleBn="পেজটি পাওয়া যায়নি" />,
  component: BuilderPage});

function BuilderMessage({ titleEn, titleBn }: { titleEn: string; titleBn: string }) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="fq-display text-2xl">{t(titleEn, titleBn)}</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}

/**
 * Small, page-local visual: the "glass browser frame" canvas mock described
 * in the deck's Section 2. It is a structural layout stand-in (rail / canvas /
 * token panel), not a photographic screenshot — the deck calls for a real
 * product screenshot eventually, but this ships no invented UI chrome beyond
 * plain labelled blocks so nothing here misrepresents an unbuilt feature.
 */
function CanvasMock() {
  return (
    <div className="fq-glass overflow-hidden rounded-fq-lg">
      {/* Studio canvas viewport bar: clean structural indicator without faux browser dots */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-xs font-semibold text-foreground">Storefront Studio Canvas</span>
        </div>
        <span className="rounded-fq-md bg-card border border-border/60 px-3 py-1 text-xs text-muted-foreground font-mono">
          yourstore.example.com
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)_minmax(0,0.7fr)] gap-px bg-border">
        <div className="space-y-2 bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Sections</p>
          {canvasMock.rail.map((item) => (
            <p key={item} className="rounded-fq-md bg-card px-2 py-1.5 text-xs text-muted-foreground">
              {item}
            </p>
          ))}
        </div>
        <div className="flex min-h-[220px] items-center justify-center bg-background p-4">
          <p className="fq-display text-lg text-muted-foreground">Live canvas</p>
        </div>
        <div className="space-y-2 bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Tokens</p>
          {canvasMock.tokens.map((item) => (
            <p key={item} className="rounded-fq-md bg-card px-2 py-1.5 text-xs text-muted-foreground">
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuilderPage() {
  const { lang, t } = useLang();
  

  const perfColumns = perfBand.columns;
  const perfRows = perfBand.rows.map((row) => ({
    id: row.id,
    label: row.label,
    cells: { budget: row.budget }}));

  const comparisonRows = comparison.rows.map((row) => ({
    id: row.id,
    label: row.label,
    cells: { generic: row.generic, framique: row.framique }}));

  const faqEntries = faq.map((entry) => ({ id: entry.id, question: entry.question, answer: entry.answer }));

  return (
    <PublicShell >
      {/* 1 — Hero, aurora. The only H1 on the page. */}
      <HeroBand
        eyebrow={hero.eyebrow}
        title={hero.title}
        titleBn={hero.titleBn}
        sub={hero.sub}
        subBn={hero.subBn}
        actions={
          <>
            <Link
              to="/auth"
              search={{ mode: "signup", accountType: "merchant" }}
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 transition-all"
            >
              {hero.primaryCta}
            </Link>
            <Link
              to="/pricing"
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
            >
              {hero.altCta}
            </Link>
          </>
        }
      />

      {/* 2 — Canvas mock: glass browser frame, structural claim about renderer parity. */}
      <Band surface="canvas" labelledBy="canvas-mock-title">
        <BandHeading id="canvas-mock-title" eyebrow="Same renderer, no surprises" title={canvasMock.title} />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <CanvasMock />
          <div>
            <p className="fq-measure text-muted-foreground">{canvasMock.caption}</p>
            <p lang="bn" className="font-bangla mt-2 text-sm text-muted-foreground">
              {canvasMock.captionBn}
            </p>
            <p className="fq-measure mt-4 text-sm text-muted-foreground">{canvasMock.body}</p>
          </div>
        </div>
      </Band>

      {/* 3 — Section-based editing model, four alternating Z rows. */}
      <Band surface="canvas" labelledBy="editing-model-title" divided>
        <BandHeading
          id="editing-model-title"
          eyebrow="The editing model"
          title="Sections, tokens, versions, sandboxing"
          level={2}
        />
        <div className="mt-4">
          {editingRows.map((row) => (
            <ZRow
              key={row.id}
              direction={row.direction}
              eyebrow={row.eyebrow}
              title={row.title}
              body={row.body}
              proof={row.proof}
              level={3}
            />
          ))}
        </div>
      </Band>

      {/* 4 — Publish lifecycle: drafts, autosave, versioning, rollback, schedule. */}
      <Band surface="canvas" labelledBy="lifecycle-title" divided>
        <BandHeading id="lifecycle-title" eyebrow="Never ship by accident" title={lifecycle.title} />
        <p className="fq-measure mt-6 text-muted-foreground">{lifecycle.intro}</p>
        <div className="mt-10">
          <MatrixTable
            caption="The publish lifecycle: stage, visibility, and reversibility"
            layout="cards"
            columns={[
              { id: "happens", label: "What happens" },
              { id: "who", label: "Who sees it" },
              { id: "reversible", label: "Reversible?" },
            ]}
            rows={lifecycle.rows.map((row) => ({
              id: row.stage,
              label: row.stage,
              cells: { happens: row.happens, who: row.who, reversible: row.reversible }}))}
          />
        </div>
        <p className="fq-measure mt-8 text-muted-foreground">{lifecycle.worked}</p>
        <p className="fq-measure mt-4 text-muted-foreground">{lifecycle.scheduled}</p>
      </Band>

      {/* 5 — The five official themes: merchandising guidance + decision table. */}
      <Band surface="canvas" labelledBy="themes-title" divided>
        <BandHeading
          id="themes-title"
          eyebrow="Bounded choice"
          title="Five official themes, five business situations"
          sub="Each is a complete section library, token set, and default layout — not a colour skin on top of one generic template."
        />
        <div className="mt-10">
          <CardGrid
            columns={3}
            cards={themes.map((theme) => ({
              id: theme.id,
              icon: <LayoutGrid aria-hidden="true" className="size-5" />,
              title: theme.name,
              body: theme.body,
              meta: <Chip>{theme.fit}</Chip>}))}
          />
        </div>
        <div className="mt-10">
          <MatrixTable
            caption={themeDecisionTable.caption}
            layout="cards"
            columns={[
              { id: "theme", label: "Choose", highlight: true },
              { id: "because", label: "Because" },
            ]}
            rows={themeDecisionTable.rows.map((row) => ({
              id: row.situation,
              label: row.situation,
              cells: { theme: row.theme, because: row.because }}))}
          />
        </div>
      </Band>

      {/* 6 — Design tokens and brand consistency. */}
      <Band surface="canvas" labelledBy="tokens-title" divided>
        <BandHeading id="tokens-title" eyebrow="Single source of truth" title={tokensBand.title} />
        <p className="fq-measure mt-6 text-muted-foreground">{tokensBand.body}</p>
        <p className="fq-measure mt-4 text-muted-foreground">{tokensBand.worked}</p>
        <Chip className="mt-6">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          {tokensBand.note}
        </Chip>
      </Band>

      {/* 7 — Bangla + English from one catalogue. */}
      <Band surface="glass" labelledBy="catalogue-title" divided>
        <BandHeading
          id="catalogue-title"
          eyebrow="One record, two languages"
          title={bilingualCatalogue.title}
        />
        <p lang="bn" className="font-bangla fq-display mt-2 text-xl text-muted-foreground">
          {bilingualCatalogue.titleBn}
        </p>
        <p className="fq-measure mt-6 text-muted-foreground">{bilingualCatalogue.body}</p>
        <p lang="bn" className="font-bangla fq-measure mt-3 text-sm text-muted-foreground">
          {bilingualCatalogue.bodyBn}
        </p>
        <p className="fq-measure mt-4 text-muted-foreground">{bilingualCatalogue.commercial}</p>
        <Chip className="mt-6">
          <Globe2 aria-hidden="true" className="size-3.5" />
          {bilingualCatalogue.typography}
        </Chip>
      </Band>

      {/* 8 & 9 — Fonts (licence + weight budget) and custom code (sandbox + secret scan). */}
      <Band surface="canvas" labelledBy="fonts-code-title" divided>
        <BandHeading
          id="fonts-code-title"
          eyebrow="Friction as feature"
          title="Custom fonts and custom code, with guardrails"
        />
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="fq-display text-xl">
              <TypeIcon aria-hidden="true" className="mr-2 inline size-5 text-muted-foreground" />
              {fontsAndCode.fontsTitle}
            </h3>
            <p className="fq-measure mt-3 text-sm text-muted-foreground">{fontsAndCode.fontsBody}</p>
            <p className="fq-measure mt-3 text-sm text-muted-foreground">{fontsAndCode.fontsBudget}</p>
            <p className="fq-measure mt-3 text-sm text-muted-foreground">{fontsAndCode.fontsWorked}</p>
          </div>
          <div>
            <h3 className="fq-display text-xl">
              <ShieldCheck aria-hidden="true" className="mr-2 inline size-5 text-muted-foreground" />
              {fontsAndCode.codeTitle}
            </h3>
            <p className="fq-measure mt-3 text-sm text-muted-foreground">{fontsAndCode.codeBody}</p>
            <p className="fq-measure mt-3 text-sm text-muted-foreground">{fontsAndCode.codeScanning}</p>
          </div>
        </div>
      </Band>

      {/* 10 — Performance budgets: why LCP matters for BDT conversion. */}
      <Band surface="canvas" labelledBy="perf-title" divided>
        <BandHeading id="perf-title" eyebrow="Made-concrete abstraction" title={perfBand.title} />
        <p className="fq-measure mt-6 text-muted-foreground">{perfBand.intro}</p>
        <div className="mt-10">
          <MatrixTable
            caption={perfBand.caption}
            layout="cards"
            columns={perfColumns}
            rows={perfRows}
          />
        </div>
        <p className="fq-measure mt-8 text-sm text-muted-foreground">
          <Gauge aria-hidden="true" className="mr-2 inline size-4" />
          {perfBand.worked}
        </p>
        <p className="fq-measure mt-4 text-muted-foreground">{perfBand.enforcement}</p>
      </Band>

      {/* 11 — Anatomy of a high-converting product page: 15-item checklist. */}
      <Band surface="glass" labelledBy="checklist-title" divided>
        <BandHeading
          id="checklist-title"
          eyebrow="Checklist completeness"
          title="Anatomy of a high-converting Bangladeshi product page"
        />
        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {productPageChecklist.map((item, index) => (
            <li key={item} className="fq-glass flex gap-3 rounded-fq-md p-4 text-sm text-muted-foreground">
              <span className="fq-display shrink-0 text-muted-foreground">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </Band>

      {/* 12 — Your first hour in the builder, step by step. */}
      <Band surface="canvas" labelledBy="first-hour-title" divided>
        <BandHeading
          id="first-hour-title"
          eyebrow="Implementation intention"
          title="Your first hour in the builder"
        />
        <ol className="mt-8 space-y-4">
          {firstHour.map((step) => (
            <li key={step.title} className="flex gap-4 border-l border-border pl-4">
              <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {step.time}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Band>

      {/* 13 — Comparison vs generic page builders. */}
      <Band surface="canvas" labelledBy="comparison-title" divided>
        <BandHeading
          id="comparison-title"
          eyebrow="Contrast framing"
          title="Framique builder vs. generic page builders"
        />
        <div className="mt-10">
          <MatrixTable
            caption={comparison.caption}
            layout="cards"
            columns={[
              { id: "generic", label: "Generic page builder" },
              { id: "framique", label: "Framique builder", highlight: true },
            ]}
            rows={comparisonRows}
            note={comparison.note}
          />
        </div>
      </Band>

      {/* 14 — Accessibility. */}
      <Band surface="glass" labelledBy="accessibility-title" divided>
        <BandHeading id="accessibility-title" eyebrow="Built in, not bolted on" title={accessibility.title} />
        <p className="fq-measure mt-6 text-muted-foreground">{accessibility.body}</p>
      </Band>

      {/* 15 — FAQ (10), verbatim source shared with buildGraph. */}
      <Band surface="canvas" labelledBy="faq-title" divided>
        <BandHeading id="faq-title" eyebrow="Questions" title={t("Frequently asked questions", "সাধারণ জিজ্ঞাসা")} />
        <FaqBand entries={faqEntries} />
      </Band>

      {/* 16 — Final CTA, gradient spotlight. */}
      <CtaBand
        title={lang === "bn" ? cta.titleBn : cta.title}
        primary={
          <Link
            to="/auth"
            search={{ mode: "signup", accountType: "merchant" }}
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 transition-all"
          >
            {cta.primaryCta}
          </Link>
        }
        secondary={
          <Link
            to="/pricing"
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
          >
            {cta.altCta}
          </Link>
        }
      />

      {/* Icon import kept for the History mark used in the deck's icon list;
          referenced here so the section-history concept has a visible glyph
          without inventing an unbuilt version-timeline component. */}
      <span className="sr-only" aria-hidden="true">
        <History className="size-0" />
      </span>
    </PublicShell>
  );
}
