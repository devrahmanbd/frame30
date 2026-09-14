import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Eye, EyeOff, FileText, Trash2 } from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { renderPageMarkdown } from "@/lib/storefront-search";
import { archivePageFn, pagesDeskFn, savePageFn } from "@/lib/storefront-search.functions";
import { PageBuilder } from "@/components/builder/page/PageBuilder";
import { PageCanvas } from "@/components/builder/page/PageCanvas";
import {
  emptyDoc,
  isBuilderBody,
  parseBuilderBody,
  serializeBuilderBody,
  starterDoc,
  type BuilderDoc,
} from "@/lib/page-builder";

export const Route = createFileRoute("/_authenticated/admin/pages")({
  head: () => ({
    meta: [
      { title: "Store pages — Framique Admin" },
      {
        name: "description",
        content:
          "Write policy, delivery and about pages for your storefront with live preview, SEO metadata and indexing control.",
      },
      { property: "og:title", content: "Store pages desk" },
      {
        property: "og:description",
        content: "Tenant-scoped content pages with preview, metadata and publish control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagesDeskPage,
});

const card = "rounded-fq-lg border border-border bg-card p-5";
const input =
  "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  robots: "index,follow" | "noindex,follow" | "noindex,nofollow";
  isPublished: boolean;
  showInNav: boolean;
  position: number;
};

const BLANK: Draft = {
  id: null,
  slug: "",
  title: "",
  excerpt: "",
  bodyMarkdown: "",
  metaTitle: "",
  metaDescription: "",
  robots: "index,follow",
  isPublished: false,
  showInNav: true,
  position: 0,
};

const SUGGESTED = [
  { slug: "about", title: "About us" },
  { slug: "delivery", title: "Delivery & shipping" },
  { slug: "returns", title: "Returns & refunds" },
  { slug: "privacy", title: "Privacy policy" },
  { slug: "terms", title: "Terms of service" },
] as const;

function PagesDeskPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(BLANK);

  const deskFn = useServerFn(pagesDeskFn);
  const desk = useQuery({
    queryKey: ["pages-desk", merchantId],
    queryFn: () => deskFn({ data: { merchantId: merchantId! } }),
    enabled: Boolean(merchantId),
  });

  const saveFn = useServerFn(savePageFn);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { merchantId: merchantId!, ...draft } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pages-desk", merchantId] });
      toast.success(t("Page saved", "পেজ সংরক্ষিত"));
      setDraft(BLANK);
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("slug")
          ? t("Use lowercase letters, numbers and dashes only.", "শুধু ছোট হাতের অক্ষর, সংখ্যা ও ড্যাশ ব্যবহার করুন।")
          : t("Could not save this page.", "এই পেজটি সংরক্ষণ করা যায়নি।"),
      ),
  });

  const archiveFn = useServerFn(archivePageFn);
  const archive = useMutation({
    mutationFn: (pageId: string) => archiveFn({ data: { merchantId: merchantId!, pageId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pages-desk", merchantId] });
      toast.success(t("Page archived", "পেজ আর্কাইভ হয়েছে"));
    },
    onError: () => toast.error(t("Could not archive this page.", "পেজটি আর্কাইভ করা যায়নি।")),
  });

  const stats = desk.data?.stats;

  // Deep links from the Content desk: `?edit=<id>` opens that page, `?new=1` a blank one.
  const deepLinked = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    const key = editId ?? (params.get("new") ? "new" : null);
    if (!key || deepLinked.current === key) return;
    if (key === "new") {
      deepLinked.current = key;
      setDraft(BLANK);
      return;
    }
    const p = desk.data?.pages.find((x) => x.id === editId);
    if (!p) return;
    deepLinked.current = key;
    setDraft({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt ?? "",
      bodyMarkdown: p.body_markdown,
      metaTitle: p.meta_title ?? "",
      metaDescription: p.meta_description ?? "",
      robots: p.robots as Draft["robots"],
      isPublished: p.is_published,
      showInNav: p.show_in_nav,
      position: p.position,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [desk.data]);

  const builderDoc: BuilderDoc | null = parseBuilderBody(draft.bodyMarkdown);
  const mode: "markdown" | "builder" = isBuilderBody(draft.bodyMarkdown) ? "builder" : "markdown";
  const switchMode = (next: "markdown" | "builder") => {
    if (next === mode) return;
    setDraft((p) => ({
      ...p,
      bodyMarkdown:
        next === "builder"
          ? serializeBuilderBody(p.bodyMarkdown.trim() ? emptyDoc() : starterDoc(p.title || "New page"))
          : "",
    }));
  };
  const setDoc = (doc: BuilderDoc) => setDraft((p) => ({ ...p, bodyMarkdown: serializeBuilderBody(doc) }));
  const preview = mode === "builder" ? "" : renderPageMarkdown(draft.bodyMarkdown);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-2xl font-bold">{t("Store pages", "দোকানের পেজ")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Policy, delivery and about pages shoppers can read before they buy. Only published pages appear in your storefront and sitemap.",
            "ক্রেতারা কেনার আগে যে নীতি, ডেলিভারি ও পরিচিতি পেজ পড়বেন। শুধু প্রকাশিত পেজ দোকানে ও সাইটম্যাপে দেখা যায়।",
          )}
        </p>
      </header>

      {stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t("Pages", "পেজ"), stats.total],
            [t("Published", "প্রকাশিত"), stats.published],
            [t("Missing description", "বিবরণ নেই"), stats.missingMeta],
            [t("Not indexed", "ইনডেক্স নয়"), stats.noindex],
          ].map(([label, value]) => (
            <div key={String(label)} className={card}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="money mt-1 text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {stats && stats.missingMeta > 0 && (
        <p className="flex items-start gap-2 rounded-fq-md border border-warn bg-warn/10 p-3 text-sm text-warn-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(
            "Some pages have no summary, so search engines will guess one. Add a short description to each.",
            "কিছু পেজে সারসংক্ষেপ নেই, তাই সার্চ ইঞ্জিন নিজে অনুমান করবে। প্রতিটিতে ছোট বিবরণ যোগ করুন।",
          )}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className={card}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-bangla-display text-lg font-semibold">
            {draft.id ? t("Edit page", "পেজ সম্পাদনা") : t("New page", "নতুন পেজ")}
          </h2>

          {!draft.id && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, slug: s.slug, title: s.title }))}
                  className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label htmlFor="pg-title" className="text-xs text-muted-foreground">
              {t("Title", "শিরোনাম")}
              <input
                id="pg-title"
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                className={`mt-1 ${input}`}
              />
            </label>
            <label htmlFor="pg-slug" className="text-xs text-muted-foreground">
              {t("Web address", "ওয়েব ঠিকানা")}
              <input
                id="pg-slug"
                required
                maxLength={60}
                value={draft.slug}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))
                }
                className={`mt-1 ${input}`}
              />
            </label>
          </div>

          <label htmlFor="pg-excerpt" className="mt-3 block text-xs text-muted-foreground">
            {t("Short summary", "ছোট সারসংক্ষেপ")}
            <input
              id="pg-excerpt"
              maxLength={300}
              value={draft.excerpt}
              onChange={(e) => setDraft((p) => ({ ...p, excerpt: e.target.value }))}
              className={`mt-1 ${input}`}
            />
          </label>

          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t("Content", "বিষয়বস্তু")}</span>
              <div className="flex gap-1 rounded-fq-md border border-border p-0.5">
                {(["markdown", "builder"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => switchMode(m)}
                    className={`min-h-8 rounded-fq-sm px-3 text-xs font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {m === "markdown" ? t("Markdown", "মার্কডাউন") : t("Page builder", "পেজ বিল্ডার")}
                  </button>
                ))}
              </div>
            </div>

            {mode === "markdown" ? (
              <label htmlFor="pg-body" className="mt-2 block text-xs text-muted-foreground">
                <textarea
                  id="pg-body"
                  rows={10}
                  maxLength={40000}
                  value={draft.bodyMarkdown}
                  onChange={(e) => setDraft((p) => ({ ...p, bodyMarkdown: e.target.value }))}
                  className="mt-1 w-full rounded-fq-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                <span className="money mt-1 block text-right text-xs text-muted-foreground">
                  {draft.bodyMarkdown.length} / 40000
                </span>
              </label>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Design this page with sections, columns and widgets in the builder below.",
                  "নিচের বিল্ডারে সেকশন, কলাম ও উইজেট দিয়ে এই পেজ ডিজাইন করুন।",
                )}
              </p>
            )}
          </div>


          <fieldset className="mt-3 grid gap-3 sm:grid-cols-2">
            <legend className="text-xs font-medium text-muted-foreground">{t("Search listing", "সার্চ তালিকা")}</legend>
            <label htmlFor="pg-meta-title" className="text-xs text-muted-foreground">
              {t("Meta title", "মেটা শিরোনাম")}
              <input
                id="pg-meta-title"
                maxLength={60}
                value={draft.metaTitle}
                onChange={(e) => setDraft((p) => ({ ...p, metaTitle: e.target.value }))}
                className={`mt-1 ${input}`}
              />
            </label>
            <label htmlFor="pg-meta-desc" className="text-xs text-muted-foreground">
              {t("Meta description", "মেটা বিবরণ")}
              <input
                id="pg-meta-desc"
                maxLength={160}
                value={draft.metaDescription}
                onChange={(e) => setDraft((p) => ({ ...p, metaDescription: e.target.value }))}
                className={`mt-1 ${input}`}
              />
            </label>
            <label htmlFor="pg-robots" className="text-xs text-muted-foreground">
              {t("Indexing", "ইনডেক্সিং")}
              <select
                id="pg-robots"
                value={draft.robots}
                onChange={(e) => setDraft((p) => ({ ...p, robots: e.target.value as Draft["robots"] }))}
                className={`mt-1 ${input}`}
              >
                <option value="index,follow">{t("Show in search results", "সার্চে দেখান")}</option>
                <option value="noindex,follow">{t("Hide from search results", "সার্চে দেখাবেন না")}</option>
                <option value="noindex,nofollow">{t("Hide and do not follow links", "লুকান ও লিংক অনুসরণ করবেন না")}</option>
              </select>
            </label>
            <label htmlFor="pg-position" className="text-xs text-muted-foreground">
              {t("Order in menu", "মেনুর ক্রম")}
              <input
                id="pg-position"
                type="number"
                min={0}
                max={999}
                value={draft.position}
                onChange={(e) => setDraft((p) => ({ ...p, position: Number(e.target.value) || 0 }))}
                className={`money mt-1 ${input}`}
              />
            </label>
          </fieldset>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(e) => setDraft((p) => ({ ...p, isPublished: e.target.checked }))}
                className="size-4 accent-[var(--bd-teal-700)]"
              />
              {t("Published", "প্রকাশিত")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.showInNav}
                onChange={(e) => setDraft((p) => ({ ...p, showInNav: e.target.checked }))}
                className="size-4 accent-[var(--bd-teal-700)]"
              />
              {t("Show in store menu", "দোকানের মেনুতে দেখান")}
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={save.isPending || !merchantId}
              className="min-h-11 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save page", "পেজ সংরক্ষণ")}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft(BLANK)}
                className="min-h-11 rounded-fq-md border border-border px-4 text-sm"
              >
                {t("Cancel", "বাতিল")}
              </button>
            )}
          </div>
        </form>

        <section className={card} aria-label={t("Preview", "প্রিভিউ")}>
          <h2 className="font-bangla-display text-lg font-semibold">{t("Preview", "প্রিভিউ")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "This is exactly how shoppers will see the page. Only headings, lists, links, bold and italic are kept.",
              "ক্রেতারা ঠিক এভাবেই পেজটি দেখবেন। শুধু শিরোনাম, তালিকা, লিংক, বোল্ড ও ইটালিক রাখা হয়।",
            )}
          </p>
          <div className="mt-4 rounded-fq-md border border-border bg-background p-4">
            <h3 className="font-bangla-display text-xl font-bold">{draft.title || t("Untitled page", "শিরোনামহীন পেজ")}</h3>
            {draft.excerpt && <p className="mt-1 text-sm text-muted-foreground">{draft.excerpt}</p>}
            {mode === "builder" && builderDoc ? (
              <PageCanvas doc={builderDoc} />
            ) : (
              <div className="fq-prose mt-3 space-y-3 text-sm" dangerouslySetInnerHTML={{ __html: preview }} />
            )}
          </div>
        </section>
      </div>

      {mode === "builder" && builderDoc && (
        <PageBuilder doc={builderDoc} onChange={setDoc} title={draft.title || t("Untitled page", "শিরোনামহীন পেজ")} />
      )}

      <section className={card}>
        <h2 className="font-bangla-display text-lg font-semibold">{t("All pages", "সব পেজ")}</h2>
        {desk.isPending && (
          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
            {t("Loading pages…", "পেজ লোড হচ্ছে…")}
          </p>
        )}
        {desk.data?.pages.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("No pages yet — start with a delivery or returns policy.", "এখনও কোনো পেজ নেই — ডেলিভারি বা রিটার্ন নীতি দিয়ে শুরু করুন।")}
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {desk.data?.pages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-fq-md border border-border p-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  {p.title}
                </span>
                <span className="money block text-xs text-muted-foreground">/{p.slug}</span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                {p.is_published ? (
                  <span className="inline-flex items-center gap-1 text-success-foreground">
                    <Eye className="size-3.5" aria-hidden /> {t("Published", "প্রকাশিত")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <EyeOff className="size-3.5" aria-hidden /> {t("Draft", "খসড়া")}
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: p.id,
                      slug: p.slug,
                      title: p.title,
                      excerpt: p.excerpt ?? "",
                      bodyMarkdown: p.body_markdown,
                      metaTitle: p.meta_title ?? "",
                      metaDescription: p.meta_description ?? "",
                      robots: p.robots as Draft["robots"],
                      isPublished: p.is_published,
                      showInNav: p.show_in_nav,
                      position: p.position,
                    })
                  }
                  className="min-h-9 rounded-fq-md border border-border px-3 text-xs"
                >
                  {t("Edit", "সম্পাদনা")}
                </button>
                <button
                  type="button"
                  aria-label={t(`Archive ${p.title}`, `${p.title} আর্কাইভ করুন`)}
                  onClick={() => archive.mutate(p.id)}
                  className="rounded-fq-md p-2 text-danger-foreground hover:bg-danger/10"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
