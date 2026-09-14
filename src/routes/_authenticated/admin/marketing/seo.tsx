import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import { seoGateFn, seoIndexFn, seoLoadFn, seoSaveFn } from "@/lib/seo.functions";
import { BulkSeoTable } from "@/components/admin/seo/BulkSeoTable";
import { SerpPreview } from "@/components/admin/seo/SerpPreview";
import { useSeoAnalysis } from "@/hooks/use-seo-analysis";
import { SeoTemplatesPanel } from "@/components/admin/SeoTemplatesPanel";
import { PermalinkDesk } from "@/components/admin/seo/PermalinkDesk";
import { CrawlDesk } from "@/components/admin/seo/CrawlDesk";
import { SiteKitDesk } from "@/components/admin/seo/SiteKitDesk";
import { SemrushDesk } from "@/components/admin/seo/SemrushDesk";
import { WeightDesk } from "@/components/admin/seo/WeightDesk";
import { HealthDesk } from "@/components/admin/seo/HealthDesk";

import {
  FAQ_A_MAX,
  FAQ_MAX,
  FAQ_Q_MAX,
  SECONDARY_KEYWORDS_MAX,
  SEO_DESC_MAX,
  SEO_TITLE_MAX,
  scoreBand,
  type FaqItem,
  type SeoCheck,
} from "@/lib/seo-analysis";

export const Route = createFileRoute("/_authenticated/admin/marketing/seo")({
  head: () => ({
    meta: [
      { title: "SEO & answer engines — Framique Marketing" },
      {
        name: "description",
        content:
          "Score and publish meta titles, descriptions, canonicals, social cards and FAQ answers for every storefront surface.",
      },
      { property: "og:title", content: "SEO focus panel" },
      {
        property: "og:description",
        content: "Live SEO/AEO scoring with audit trail for products, collections, pages and articles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeoPanel,
});

type Draft = {
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogImageUrl: string;
  focusKeyword: string;
  secondaryKeywords: string[];
  faq: FaqItem[];
};

const EMPTY: Draft = {
  metaTitle: "",
  metaDescription: "",
  canonical: "",
  robotsIndex: true,
  robotsFollow: true,
  ogImageUrl: "",
  focusKeyword: "",
  secondaryKeywords: [],
  faq: [],
};

const groupLabel: Record<SeoCheck["group"], { en: string; bn: string }> = {
  meta: { en: "Search snippet", bn: "সার্চ স্নিপেট" },
  social: { en: "Social card", bn: "সোশ্যাল কার্ড" },
  indexing: { en: "Indexing", bn: "ইনডেক্সিং" },
  aeo: { en: "Answer engines", bn: "আনসার ইঞ্জিন" },
  content: { en: "Content", bn: "কনটেন্ট" },
  links: { en: "Links", bn: "লিংক" },
  readability: { en: "Readability", bn: "পঠনযোগ্যতা" },
};

const tone = { pass: "success", warn: "warning", fail: "danger", skip: "neutral" } as const;


function SeoPanel() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const index = useServerFn(seoIndexFn);
  const load = useServerFn(seoLoadFn);
  const save = useServerFn(seoSaveFn);

  const [selected, setSelected] = useState<string>("store:-");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [dirty, setDirty] = useState(false);

  const listQuery = useQuery({ queryKey: ["seo", "index"], queryFn: () => index() });
  const entities = listQuery.data?.entities ?? [];
  const entity = useMemo(
    () => entities.find((e) => `${e.type}:${e.id ?? "-"}` === selected) ?? entities[0] ?? null,
    [entities, selected],
  );

  const detail = useQuery({
    queryKey: ["seo", "meta", entity?.type, entity?.id],
    enabled: Boolean(entity),
    queryFn: () => load({ data: { entityType: entity!.type, entityId: entity!.id } }),
  });

  useEffect(() => {
    if (!detail.data) return;
    setDraft({
      metaTitle: detail.data.metaTitle,
      metaDescription: detail.data.metaDescription,
      canonical: detail.data.canonical,
      robotsIndex: detail.data.robotsIndex,
      robotsFollow: detail.data.robotsFollow,
      ogImageUrl: detail.data.ogImageUrl,
      focusKeyword: detail.data.focusKeyword,
      secondaryKeywords: detail.data.secondaryKeywords ?? [],
      faq: detail.data.faq,
    });
    setDirty(false);
  }, [detail.data]);

  // Scored off the main thread while the merchant types; the same pure
  // function the server will re-run on save, so the number never changes
  // underneath them.
  const analysisDraft = useMemo(
    () => ({
      ...draft,
      content: entity?.content ?? "",
      url: entity?.path,
      locale: lang === "bn" ? ("bn" as const) : ("en" as const),
      fallbackTitle: entity?.fallbackTitle ?? "",
      fallbackDescription: entity?.fallbackDescription ?? "",
    }),
    [draft, entity, lang],
  );
  const { report, analysing } = useSeoAnalysis(analysisDraft);
  const band = scoreBand(report.score);

  // Advisory read of the factual publish gate: shown before publishing, not
  // as a surprise error afterwards.
  const gateFn = useServerFn(seoGateFn);
  const gate = useQuery({
    queryKey: ["seo", "gate", entity?.type, entity?.id, draft.metaTitle, draft.canonical, draft.robotsIndex],
    enabled: Boolean(entity),
    staleTime: 30_000,
    queryFn: () =>
      gateFn({
        data: {
          entityType: entity!.type,
          entityId: entity!.id,
          title: draft.metaTitle || entity!.fallbackTitle,
          description: draft.metaDescription || entity!.fallbackDescription,
          canonical: draft.canonical,
          robotsIndex: draft.robotsIndex,
        },
      }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          entityType: entity!.type,
          entityId: entity!.id,
          ...draft,
          content: entity?.content?.slice(0, 20000) ?? "",
          url: entity?.path,
          locale: lang === "bn" ? "bn" : "en",
          fallbackTitle: entity?.fallbackTitle ?? "",
          fallbackDescription: entity?.fallbackDescription ?? "",
        },
      }),
    onSuccess: () => {
      setDirty(false);
      toast.success(t("SEO settings saved", "এসইও সেটিংস সংরক্ষিত হয়েছে"));
      void qc.invalidateQueries({ queryKey: ["seo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  if (listQuery.isError) {
    return <ErrorFrame message={(listQuery.error as Error).message} />;
  }

  const title = clampPreview(draft.metaTitle || entity?.fallbackTitle || "", SEO_TITLE_MAX);
  const desc = clampPreview(draft.metaDescription || entity?.fallbackDescription || "", SEO_DESC_MAX);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-bangla-display text-2xl font-bold">
          {t("SEO & answer engines", "এসইও ও আনসার ইঞ্জিন")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Every storefront surface scored the same way the server scores it before saving.",
            "প্রতিটি স্টোরফ্রন্ট পৃষ্ঠার স্কোর সার্ভারের নিয়মেই গণনা করা হয়।",
          )}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label={t("Optimisable pages", "অপ্টিমাইজযোগ্য পৃষ্ঠা")} className="space-y-1">
          {listQuery.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}
          {entities.map((e) => {
            const key = `${e.type}:${e.id ?? "-"}`;
            const active = entity && key === `${entity.type}:${entity.id ?? "-"}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{e.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{e.path}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {e.score === null ? "—" : e.score}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="space-y-6">
          {!entity ? null : (
            <>
              <div className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{entity.label}</h2>
                    <p className="text-xs text-muted-foreground">{entity.path}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill
                      tone={band.tone}
                      label={
                        analysing
                          ? t("Scoring…", "স্কোর হচ্ছে…")
                          : `${band.label} · ${report.score}/100`
                      }
                    />
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={!dirty || saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                    >
                      {saveMutation.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save", "সংরক্ষণ")}
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <SerpPreview
                    title={title}
                    description={desc}
                    url={entity.path}
                    ogImage={draft.ogImageUrl}
                  />
                </div>

                {gate.data && (gate.data.failures.length > 0 || gate.data.notices.length > 0) && (
                  <ul
                    className="mt-4 space-y-2 rounded-md border border-border p-3 text-sm"
                    aria-label={t("Publish gate", "প্রকাশের গেট")}
                  >
                    {[...gate.data.failures, ...gate.data.notices].map((f) => (
                      <li key={f.code} className="flex items-start gap-2">
                        <StatusPill
                          tone={f.blocking ? "danger" : "warning"}
                          label={f.blocking ? t("Blocks publish", "প্রকাশ আটকাবে") : t("Advisory", "পরামর্শ")}
                        />
                        <span>{lang === "bn" ? f.messageBn : f.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <h3 className="font-medium">{t("Snippet", "স্নিপেট")}</h3>
                  <Field label={t("Meta title", "মেটা শিরোনাম")}>
                    <input
                      className={inputClass}
                      value={draft.metaTitle}
                      maxLength={300}
                      placeholder={entity.fallbackTitle}
                      onChange={(e) => set("metaTitle", e.target.value)}
                    />
                    <Counter value={draft.metaTitle.length} max={SEO_TITLE_MAX} lang={lang} />
                  </Field>
                  <Field label={t("Meta description", "মেটা বিবরণ")}>
                    <textarea
                      className={`${inputClass} min-h-24`}
                      value={draft.metaDescription}
                      maxLength={600}
                      placeholder={entity.fallbackDescription}
                      onChange={(e) => set("metaDescription", e.target.value)}
                    />
                    <Counter value={draft.metaDescription.length} max={SEO_DESC_MAX} lang={lang} />
                  </Field>
                  <Field label={t("Focus keyword", "ফোকাস কীওয়ার্ড")}>
                    <input
                      className={inputClass}
                      value={draft.focusKeyword}
                      onChange={(e) => set("focusKeyword", e.target.value)}
                    />
                  </Field>
                  <Field
                    label={t(
                      `Secondary keywords (max ${SECONDARY_KEYWORDS_MAX}, comma separated)`,
                      `সহায়ক কীওয়ার্ড (সর্বোচ্চ ${SECONDARY_KEYWORDS_MAX}টি, কমা দিয়ে)`,
                    )}
                  >
                    <input
                      className={inputClass}
                      value={draft.secondaryKeywords.join(", ")}
                      onChange={(e) =>
                        set(
                          "secondaryKeywords",
                          e.target.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean)
                            .slice(0, SECONDARY_KEYWORDS_MAX),
                        )
                      }
                    />
                  </Field>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt>{t("Words", "শব্দ")}</dt>
                      <dd className="tabular-nums text-foreground">{report.facts.words}</dd>
                    </div>
                    <div>
                      <dt>{t("Internal links", "অভ্যন্তরীণ লিংক")}</dt>
                      <dd className="tabular-nums text-foreground">{report.facts.internalLinks}</dd>
                    </div>
                    <div>
                      <dt>{t("Keyword density", "কীওয়ার্ড ঘনত্ব")}</dt>
                      <dd className="tabular-nums text-foreground">
                        {report.facts.keywordDensity.toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Reading ease", "পড়ার সহজতা")}</dt>
                      <dd className="tabular-nums text-foreground">
                        {report.facts.readability.applicable ? report.facts.readability.ease : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-4 rounded-lg border border-border p-4">
                  <h3 className="font-medium">{t("Indexing & social", "ইনডেক্সিং ও সোশ্যাল")}</h3>
                  <Field label={t("Canonical URL", "ক্যানোনিকাল ইউআরএল")}>
                    <input
                      className={inputClass}
                      value={draft.canonical}
                      placeholder="https://"
                      onChange={(e) => set("canonical", e.target.value)}
                    />
                  </Field>
                  <Field label={t("Social image URL", "সোশ্যাল ইমেজ ইউআরএল")}>
                    <input
                      className={inputClass}
                      value={draft.ogImageUrl}
                      placeholder="https://"
                      onChange={(e) => set("ogImageUrl", e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.robotsIndex}
                        onChange={(e) => set("robotsIndex", e.target.checked)}
                      />
                      {t("Allow indexing", "ইনডেক্স করার অনুমতি")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.robotsFollow}
                        onChange={(e) => set("robotsFollow", e.target.checked)}
                      />
                      {t("Follow links", "লিংক ফলো")}
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{t("Answer engine FAQ", "আনসার ইঞ্জিন এফএকিউ")}</h3>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={draft.faq.length >= FAQ_MAX}
                    onClick={() => set("faq", [...draft.faq, { q: "", a: "" }])}
                  >
                    {t("Add answer", "উত্তর যোগ")}
                  </button>
                </div>
                {draft.faq.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "Answers become FAQPage structured data so assistants can quote this page.",
                      "উত্তরগুলো FAQPage স্ট্রাকচার্ড ডেটা হিসেবে যুক্ত হয়।",
                    )}
                  </p>
                )}
                {draft.faq.map((item, i) => (
                  <div key={i} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_2fr_auto]">
                    <input
                      className={inputClass}
                      value={item.q}
                      maxLength={FAQ_Q_MAX}
                      placeholder={t("Question", "প্রশ্ন")}
                      onChange={(e) =>
                        set(
                          "faq",
                          draft.faq.map((f, j) => (j === i ? { ...f, q: e.target.value } : f)),
                        )
                      }
                    />
                    <textarea
                      className={inputClass}
                      value={item.a}
                      maxLength={FAQ_A_MAX}
                      placeholder={t("Answer", "উত্তর")}
                      onChange={(e) =>
                        set(
                          "faq",
                          draft.faq.map((f, j) => (j === i ? { ...f, a: e.target.value } : f)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        set(
                          "faq",
                          draft.faq.filter((_, j) => j !== i),
                        )
                      }
                    >
                      {t("Remove", "মুছুন")}
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">{t("Checks", "চেক")}</h3>
                <ul className="mt-3 space-y-2">
                  {report.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 text-sm">
                      <StatusPill tone={tone[c.status]} label={t(groupLabel[c.group].en, groupLabel[c.group].bn)} />
                      <span>
                        <span className="font-medium">{lang === "bn" ? c.labelBn : c.label}</span>
                        <span className="block text-muted-foreground">
                          {lang === "bn" ? c.hintBn : c.hint}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium">{t("Recent changes", "সাম্প্রতিক পরিবর্তন")}</h3>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {(listQuery.data?.audit ?? []).map((a) => (
                    <li key={a.id} className="tabular-nums">
                      {new Date(a.created_at).toLocaleString()} — {a.entity_type} · {a.reason ?? "update"}
                    </li>
                  ))}
                  {(listQuery.data?.audit ?? []).length === 0 && <li>{t("No changes yet.", "এখনো কোনো পরিবর্তন নেই।")}</li>}
                </ul>
              </div>

              <BulkSeoTable />

              <PermalinkDesk />

              <CrawlDesk />

              <SiteKitDesk />

              <SemrushDesk />

              <WeightDesk />
              <HealthDesk />


              <SeoTemplatesPanel storeName={entity.type === "store" ? entity.label : undefined} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function clampPreview(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function Counter({ value, max, lang }: { value: number; max: number; lang: string }) {
  const over = value > max;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
      {value}/{max}
      {over ? (lang === "bn" ? " — খুব লম্বা" : " — too long") : ""}
    </span>
  );
}
