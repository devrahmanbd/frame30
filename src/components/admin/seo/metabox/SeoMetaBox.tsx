/**
 * Phase 13 — `SeoMetaBox`: the Rank Math / Yoast panel for one page or post.
 *
 * Rendered twice with the same props and the same analyser: collapsed in the
 * editor sidebar (score chip in the header) and as a full meta box under the
 * classic editor body. It owns no data — the parent holds `EntitySeo` and
 * persists it, so autosave, undo and revisions keep working unchanged.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import type { SerpDevice } from "@/lib/seo-pixels";
import {
  FOCUS_KEYWORDS_MAX,
  IMAGE_PREVIEWS,
  REDIRECT_CODES,
  SCHEMA_TYPES,
  TWITTER_CARDS,
  analyseEntitySeo,
  buildJsonLd,
  robotsContent,
  type EntitySeo,
  type RedirectCode,
  type SchemaType,
  type TwitterCard,
} from "@/lib/seo/seo-meta";
import {
  CheckRow,
  CheckboxRow,
  Collapsible,
  KeywordPills,
  TokenField,
  UnderlineTabs,
  seoInput,
} from "./parts";
import { SerpPreviewCard } from "./SerpPreviewCard";

type TabId = "general" | "advanced" | "schema" | "social";

export type SeoMetaBoxProps = {
  seo: EntitySeo;
  onChange: (next: EntitySeo) => void;
  /** What the storefront would render without overrides. */
  fallbackTitle: string;
  fallbackDescription: string;
  /** Body copy, for the content checks. */
  content: string;
  /** Absolute URL of the entity; also the preview breadcrumb. */
  url: string;
  origin: string;
  siteName: string;
  slug?: string;
  onSlugChange?: (slug: string) => void;
  excerpt?: string;
  category?: string;
  authorName?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  imageUrl?: string;
  className?: string;
};

export function SeoMetaBox(props: SeoMetaBoxProps) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<TabId>("general");
  const [device, setDevice] = useState<SerpDevice>("desktop");
  const { seo, onChange } = props;

  const patch = (part: Partial<EntitySeo>) => onChange({ ...seo, ...part });

  const report = useMemo(
    () =>
      analyseEntitySeo({
        seo,
        fallbackTitle: props.fallbackTitle,
        fallbackDescription: props.fallbackDescription,
        content: props.content,
        url: props.url,
        origin: props.origin,
        siteName: props.siteName,
        excerpt: props.excerpt ?? "",
        category: props.category ?? "",
        locale: lang === "bn" ? "bn" : "en",
      }),
    [
      seo,
      props.fallbackTitle,
      props.fallbackDescription,
      props.content,
      props.url,
      props.origin,
      props.siteName,
      props.excerpt,
      props.category,
      lang,
    ],
  );

  const jsonLd = useMemo(
    () =>
      buildJsonLd(seo, {
        url: props.url,
        siteName: props.siteName,
        authorName: props.authorName ?? "",
        publishedAt: props.publishedAt ?? null,
        updatedAt: props.updatedAt ?? null,
        imageUrl: props.imageUrl ?? seo.facebook.image,
      }),
    [
      seo,
      props.url,
      props.siteName,
      props.authorName,
      props.publishedAt,
      props.updatedAt,
      props.imageUrl,
    ],
  );

  const tone =
    report.band.tone === "success"
      ? "bg-success-soft text-success-foreground"
      : report.band.tone === "warning"
        ? "bg-warning-soft text-warning-foreground"
        : "bg-danger-soft text-danger-foreground";

  return (
    <section
      aria-label={t("SEO", "এসইও")}
      className={cn("space-y-3 rounded-fq-lg border border-border bg-card p-3", props.className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("SEO", "এসইও")}</h2>
        <div className="flex items-center gap-2">
          {seo.focusKeywords[0] && (
            <span className="inline-flex min-h-6 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground">
              {seo.focusKeywords[0]}
            </span>
          )}
          <span
            className={cn(
              "fq-num inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold",
              tone,
            )}
          >
            {report.score} / 100 · {lang === "bn" ? report.band.bn : report.band.en}
          </span>
        </div>
      </header>

      <UnderlineTabs
        label={t("SEO sections", "এসইও বিভাগ")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "general", label: t("General", "সাধারণ") },
          { id: "advanced", label: t("Advanced", "অ্যাডভান্সড") },
          { id: "schema", label: t("Schema", "স্কিমা") },
          { id: "social", label: t("Social", "সোশ্যাল") },
        ]}
      />

      {tab === "general" && (
        <div className="space-y-3">
          <SerpPreviewCard
            title={report.resolved.title}
            description={report.resolved.description}
            url={props.url}
            siteName={props.siteName}
            device={device}
            onDevice={setDevice}
          />

          <div className="space-y-1.5">
            <span className="text-xs font-medium">{t("Focus keywords", "মূল কীওয়ার্ড")}</span>
            <KeywordPills
              values={seo.focusKeywords}
              max={FOCUS_KEYWORDS_MAX}
              onChange={(focusKeywords) => patch({ focusKeywords })}
            />
          </div>

          <TokenField
            label={t("SEO title", "এসইও টাইটেল")}
            value={seo.title}
            onChange={(title) => patch({ title })}
            placeholder="%title% %sep% %sitename%"
          />

          {props.onSlugChange && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">{t("Permalink", "পার্মালিংক")}</span>
              <span className="flex items-center gap-1 rounded-fq-md border border-border bg-card px-2">
                <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                  {props.url.replace(/[^/]*$/, "")}
                </span>
                <input
                  value={props.slug ?? ""}
                  onChange={(e) => props.onSlugChange?.(e.target.value)}
                  aria-label={t("Permalink", "পার্মালিংক")}
                  className="min-h-8 w-full bg-transparent py-1.5 text-sm outline-none"
                />
              </span>
            </label>
          )}

          <TokenField
            label={t("Meta description", "মেটা বর্ণনা")}
            value={seo.description}
            onChange={(description) => patch({ description })}
            textarea
            placeholder="%excerpt%"
            footer={
              props.excerpt ? (
                <button
                  type="button"
                  onClick={() => patch({ description: props.excerpt ?? "" })}
                  className="fq-focus-glow min-h-8 rounded-fq-md px-1 text-[11px] font-medium text-primary hover:underline"
                >
                  {t("Use excerpt", "সারাংশ ব্যবহার করুন")}
                </button>
              ) : null
            }
          />

          <div className="space-y-2">
            {report.groups.map((group) => (
              <Collapsible
                key={group.id}
                defaultOpen={group.id === "basic"}
                title={lang === "bn" ? group.bn : group.en}
                meta={
                  <span className="fq-num">
                    {group.pass}/{group.total}
                  </span>
                }
              >
                <ul className="space-y-1.5">
                  {group.checks.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </ul>
              </Collapsible>
            ))}
          </div>
        </div>
      )}

      {tab === "advanced" && (
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">{t("Robots meta", "রোবটস মেটা")}</legend>
            <CheckboxRow
              checked={seo.robots.index}
              onChange={(index) => patch({ robots: { ...seo.robots, index } })}
              label={t("Index", "ইনডেক্স")}
              hint={t("Let search engines list this page.", "সার্চ ইঞ্জিন এই পেজ দেখাতে পারবে।")}
            />
            <CheckboxRow
              checked={seo.robots.follow}
              onChange={(follow) => patch({ robots: { ...seo.robots, follow } })}
              label={t("Follow links", "লিংক ফলো")}
            />
            <CheckboxRow
              checked={seo.robots.noarchive}
              onChange={(noarchive) => patch({ robots: { ...seo.robots, noarchive } })}
              label={t("No archive", "নো আর্কাইভ")}
            />
            <CheckboxRow
              checked={seo.robots.noimageindex}
              onChange={(noimageindex) => patch({ robots: { ...seo.robots, noimageindex } })}
              label={t("No image index", "নো ইমেজ ইনডেক্স")}
            />
            <CheckboxRow
              checked={seo.robots.nosnippet}
              onChange={(nosnippet) => patch({ robots: { ...seo.robots, nosnippet } })}
              label={t("No snippet", "নো স্নিপেট")}
            />
            <p className="fq-num rounded-fq-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {robotsContent(seo)}
            </p>
          </fieldset>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="font-medium">max-snippet</span>
              <input
                type="number"
                value={seo.advancedRobots.maxSnippet ?? ""}
                onChange={(e) =>
                  patch({
                    advancedRobots: {
                      ...seo.advancedRobots,
                      maxSnippet: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={seoInput}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">max-video-preview</span>
              <input
                type="number"
                value={seo.advancedRobots.maxVideoPreview ?? ""}
                onChange={(e) =>
                  patch({
                    advancedRobots: {
                      ...seo.advancedRobots,
                      maxVideoPreview: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={seoInput}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">max-image-preview</span>
              <select
                value={seo.advancedRobots.maxImagePreview}
                onChange={(e) =>
                  patch({
                    advancedRobots: {
                      ...seo.advancedRobots,
                      maxImagePreview: e.target
                        .value as EntitySeo["advancedRobots"]["maxImagePreview"],
                    },
                  })
                }
                className={seoInput}
              >
                {IMAGE_PREVIEWS.map((value) => (
                  <option key={value || "default"} value={value}>
                    {value || t("Default", "ডিফল্ট")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="font-medium">{t("Canonical URL", "ক্যানোনিকাল URL")}</span>
            <input
              value={seo.canonical}
              placeholder="https://"
              onChange={(e) => patch({ canonical: e.target.value })}
              className={seoInput}
            />
          </label>

          <label className="block space-y-1 text-xs">
            <span className="font-medium">{t("Breadcrumb title", "ব্রেডক্রাম্ব টাইটেল")}</span>
            <input
              value={seo.breadcrumbTitle}
              onChange={(e) => patch({ breadcrumbTitle: e.target.value })}
              className={seoInput}
            />
          </label>

          <fieldset className="space-y-2 rounded-fq-md border border-border p-2">
            <legend className="px-1 text-xs font-medium">{t("Redirect", "রিডাইরেক্ট")}</legend>
            <CheckboxRow
              checked={seo.redirect.enabled}
              onChange={(enabled) => patch({ redirect: { ...seo.redirect, enabled } })}
              label={t("Redirect this URL", "এই URL রিডাইরেক্ট করুন")}
            />
            {seo.redirect.enabled && (
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <input
                  value={seo.redirect.target}
                  placeholder="/new-path"
                  aria-label={t("Redirect target", "রিডাইরেক্ট গন্তব্য")}
                  onChange={(e) => patch({ redirect: { ...seo.redirect, target: e.target.value } })}
                  className={seoInput}
                />
                <select
                  value={seo.redirect.code}
                  aria-label={t("Redirect code", "রিডাইরেক্ট কোড")}
                  onChange={(e) =>
                    patch({
                      redirect: { ...seo.redirect, code: Number(e.target.value) as RedirectCode },
                    })
                  }
                  className={seoInput}
                >
                  {REDIRECT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        </div>
      )}

      {tab === "schema" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs">
            <span className="font-medium">{t("Schema type", "স্কিমা টাইপ")}</span>
            <select
              value={seo.schema.type}
              onChange={(e) =>
                patch({ schema: { ...seo.schema, type: e.target.value as SchemaType } })
              }
              className={seoInput}
            >
              {SCHEMA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "none" ? t("None", "নেই") : type}
                </option>
              ))}
            </select>
          </label>

          {seo.schema.type !== "none" && (
            <>
              <label className="block space-y-1 text-xs">
                <span className="font-medium">{t("Headline", "হেডলাইন")}</span>
                <input
                  value={seo.schema.headline}
                  placeholder={report.resolved.title}
                  onChange={(e) => patch({ schema: { ...seo.schema, headline: e.target.value } })}
                  className={seoInput}
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium">{t("Description", "বর্ণনা")}</span>
                <textarea
                  value={seo.schema.description}
                  rows={2}
                  placeholder={report.resolved.description}
                  onChange={(e) =>
                    patch({ schema: { ...seo.schema, description: e.target.value } })
                  }
                  className={seoInput}
                />
              </label>
            </>
          )}

          {seo.schema.type === "FAQPage" && (
            <Repeater
              label={t("Questions", "প্রশ্ন")}
              rows={seo.schema.faq.map((f) => [f.q, f.a] as [string, string])}
              placeholders={[t("Question", "প্রশ্ন"), t("Answer", "উত্তর")]}
              onChange={(rows) =>
                patch({ schema: { ...seo.schema, faq: rows.map(([q, a]) => ({ q, a })) } })
              }
            />
          )}

          {seo.schema.type === "HowTo" && (
            <Repeater
              label={t("Steps", "ধাপ")}
              rows={seo.schema.steps.map((s) => [s.name, s.text] as [string, string])}
              placeholders={[t("Step name", "ধাপের নাম"), t("Step detail", "ধাপের বিবরণ")]}
              onChange={(rows) =>
                patch({
                  schema: { ...seo.schema, steps: rows.map(([name, text]) => ({ name, text })) },
                })
              }
            />
          )}

          <div className="space-y-1">
            <span className="text-xs font-medium">{t("JSON-LD preview", "JSON-LD প্রিভিউ")}</span>
            <pre className="max-h-56 overflow-auto rounded-fq-md border border-border bg-muted p-2 text-[11px] leading-relaxed text-foreground">
              {jsonLd
                ? JSON.stringify(jsonLd, null, 2)
                : t("No structured data on this page.", "এই পেজে স্ট্রাকচার্ড ডেটা নেই।")}
            </pre>
            <a
              href="https://search.google.com/test/rich-results"
              target="_blank"
              rel="noreferrer noopener"
              className="fq-focus-glow inline-flex min-h-8 items-center rounded-fq-md px-1 text-[11px] font-medium text-primary hover:underline"
            >
              {t("Test with Rich Results ↗", "রিচ রেজাল্টে পরীক্ষা ↗")}
            </a>
          </div>
        </div>
      )}

      {tab === "social" && (
        <div className="space-y-3">
          {(["facebook", "twitter"] as const).map((network) => {
            const card = seo[network];
            const setCard = (part: Partial<typeof card>) =>
              patch({ [network]: { ...card, ...part } } as Partial<EntitySeo>);
            return (
              <Collapsible
                key={network}
                defaultOpen={network === "facebook"}
                title={
                  network === "facebook"
                    ? t("Facebook", "ফেসবুক")
                    : t("X (Twitter)", "এক্স (টুইটার)")
                }
              >
                <CheckboxRow
                  checked={card.useSeo}
                  onChange={(useSeo) => setCard({ useSeo })}
                  label={t("Use SEO title and description", "এসইও টাইটেল ও বর্ণনা ব্যবহার করুন")}
                />
                {!card.useSeo && (
                  <>
                    <label className="block space-y-1 text-xs">
                      <span className="font-medium">{t("Title", "টাইটেল")}</span>
                      <input
                        value={card.title}
                        onChange={(e) => setCard({ title: e.target.value })}
                        className={seoInput}
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span className="font-medium">{t("Description", "বর্ণনা")}</span>
                      <textarea
                        value={card.description}
                        rows={2}
                        onChange={(e) => setCard({ description: e.target.value })}
                        className={seoInput}
                      />
                    </label>
                  </>
                )}
                <label className="block space-y-1 text-xs">
                  <span className="font-medium">{t("Image URL", "ইমেজ URL")}</span>
                  <input
                    value={card.image}
                    placeholder="https://"
                    onChange={(e) => setCard({ image: e.target.value })}
                    className={seoInput}
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    {t(
                      "Recommended 1200 × 630 px, under 5 MB.",
                      "প্রস্তাবিত ১২০০ × ৬৩০ পিক্সেল, ৫ এমবির কম।",
                    )}
                  </span>
                </label>
                {network === "twitter" && (
                  <label className="block space-y-1 text-xs">
                    <span className="font-medium">{t("Card type", "কার্ড টাইপ")}</span>
                    <select
                      value={seo.twitter.card}
                      onChange={(e) =>
                        patch({ twitter: { ...seo.twitter, card: e.target.value as TwitterCard } })
                      }
                      className={seoInput}
                    >
                      {TWITTER_CARDS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="overflow-hidden rounded-fq-md border border-border">
                  {card.image ? (
                    <img
                      src={card.image}
                      alt=""
                      className="h-32 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-muted text-[11px] text-muted-foreground">
                      {t("No share image", "শেয়ার ইমেজ নেই")}
                    </div>
                  )}
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-[11px] uppercase text-muted-foreground">
                      {props.siteName}
                    </p>
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {card.useSeo ? report.resolved.title : card.title || report.resolved.title}
                    </p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">
                      {card.useSeo
                        ? report.resolved.description
                        : card.description || report.resolved.description}
                    </p>
                  </div>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- repeater */

function Repeater({
  label,
  rows,
  placeholders,
  onChange,
}: {
  label: string;
  rows: [string, string][];
  placeholders: [string, string];
  onChange: (rows: [string, string][]) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium">{label}</span>
      {rows.map((row, i) => (
        <div key={i} className="space-y-1 rounded-fq-md border border-border p-2">
          <input
            value={row[0]}
            placeholder={placeholders[0]}
            aria-label={`${placeholders[0]} ${i + 1}`}
            onChange={(e) => onChange(rows.map((r, j) => (i === j ? [e.target.value, r[1]] : r)))}
            className={seoInput}
          />
          <textarea
            value={row[1]}
            rows={2}
            placeholder={placeholders[1]}
            aria-label={`${placeholders[1]} ${i + 1}`}
            onChange={(e) => onChange(rows.map((r, j) => (i === j ? [r[0], e.target.value] : r)))}
            className={seoInput}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="fq-focus-glow min-h-8 rounded-fq-md px-2 text-[11px] font-medium text-danger hover:bg-danger-soft"
          >
            {t("Remove", "সরান")}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ["", ""]])}
        className="fq-focus-glow min-h-8 rounded-fq-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
      >
        {t("Add row", "সারি যোগ")}
      </button>
    </div>
  );
}
