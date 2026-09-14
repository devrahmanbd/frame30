/**
 * Phase 1 — the blog writing screen.
 *
 * Layout follows what merchants already know from WordPress: the document on
 * the left (title, permalink, editor, excerpt), the Publish box and the SEO box
 * on the right. The behaviours that make that layout trustworthy live here:
 *
 *  - **Autosave with a conscience.** Debounced, only when the content actually
 *    changed, paused while a save is in flight, backed off after a failure, and
 *    stopped entirely after repeated failures rather than hammering the API.
 *  - **Local draft recovery.** Every keystroke batch also writes a local copy
 *    (`blog-draft.ts`), so a crashed tab or an expired session does not cost the
 *    post. Recovery is offered only when the local copy genuinely diverges.
 *  - **Errors a writer can act on.** Server validation arrives as
 *    `code|field|en|bn`; we show the right language and focus the field.
 *  - **Bilingual discipline.** Bangla and English titles are separate fields
 *    and a save never derives one from the other.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant, slugify } from "@/hooks/use-merchant";
import { deleteArticleFn } from "@/lib/marketing.functions";
import { saveArticleFn, articleRevisionsFn, restoreRevisionFn } from "@/lib/cms.functions";
import { lintArticle } from "@/lib/cms-lint";
import { bodyStats, deriveExcerpt, parseBody, validateBody } from "@/lib/blog-body";
import { createDraftStore, draftHash, draftPayloadOf, recoveryOffer, type StoredDraft } from "@/lib/blog-draft";
import { ClassicEditor } from "@/components/admin/blog/ClassicEditor";
import { PageBuilder } from "@/components/builder/page/PageBuilder";
import {
  emptyDoc,
  isBuilderBody,
  parseBuilderBody,
  serializeBuilderBody,
  starterDoc,
  type BuilderDoc,
} from "@/lib/page-builder";
import { RevisionCompare } from "@/components/admin/blog/RevisionCompare";
import { ArticleTermPicker, TaxonomyDesk } from "@/components/admin/marketing/TaxonomyDesk";
import { useLang } from "@/lib/i18n";
import {
  ErrorFrame,
  Field,
  StatusPill,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/admin/MarketingUi";

export const Route = createFileRoute("/_authenticated/admin/marketing/articles")({
  head: () => ({
    meta: [
      { title: "Articles — Framique Marketing" },
      {
        name: "description",
        content: "Write, schedule and publish blog articles with SEO metadata.",
      },
      { property: "og:title", content: "Article editor" },
      {
        property: "og:description",
        content: "Blog content with slugs, tags, canonical and robots controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArticlesPage,
});

const statusTone = {
  draft: "warning",
  scheduled: "info",
  published: "success",
  archived: "neutral",
} as const;
const statusLabel: Record<string, { en: string; bn: string }> = {
  draft: { en: "Draft", bn: "খসড়া" },
  scheduled: { en: "Scheduled", bn: "নির্ধারিত" },
  published: { en: "Published", bn: "প্রকাশিত" },
  archived: { en: "Archived", bn: "আর্কাইভ" },
};

const emptyForm = {
  id: undefined as string | undefined,
  title: "",
  titleEn: "",
  slug: "",
  excerpt: "",
  body: "",
  coverImageUrl: "",
  tags: "",
  status: "draft",
  scheduledFor: "",
  metaTitle: "",
  metaDescription: "",
  canonical: "",
  robots: "index,follow",
  updatedAt: null as string | null,
};

type Form = typeof emptyForm;

/** Autosave cadence: quiet enough to be invisible, tight enough to be a net. */
const AUTOSAVE_MS = 4000;
const AUTOSAVE_MAX_FAILURES = 3;

/** `code|field|en|bn` from the server, or a plain message from anything else. */
function readServerError(message: string): { code: string; field: string; en: string; bn: string } | null {
  const parts = message.split("|");
  if (parts.length !== 4) return null;
  return { code: parts[0]!, field: parts[1]!, en: parts[2]!, bn: parts[3]! };
}

function ArticlesPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<StoredDraft | null>(null);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "paused">("idle");

  const drafts = useMemo(() => createDraftStore(), []);

  const { data: articles } = useQuery({
    queryKey: ["articles", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("articles")
        .select("*")
        .eq("merchant_id", merchantId!)
        .is("deleted_at", null)
        .neq("status", "trash")
        .order("created_at", { ascending: false });
      if (e) throw e;
      return data;
    },
  });

  const payload = useMemo(
    () =>
      draftPayloadOf({
        title: form.title,
        titleEn: form.titleEn,
        slug: form.slug,
        excerpt: form.excerpt,
        body: form.body,
        metaTitle: form.metaTitle,
        metaDescription: form.metaDescription,
      }),
    [form],
  );

  const toInput = (autosave: boolean) => ({
    id: form.id ?? null,
    title: form.title.trim(),
    titleEn: form.titleEn,
    slug: slugify(form.slug || form.titleEn || form.title),
    excerpt: form.excerpt,
    body: form.body,
    coverImageUrl: form.coverImageUrl,
    tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
    status: form.status as "draft" | "scheduled" | "published" | "archived",
    scheduledFor: form.scheduledFor || null,
    metaTitle: form.metaTitle,
    metaDescription: form.metaDescription,
    canonical: form.canonical,
    robots: form.robots,
    autosave,
  });

  const blocks = useMemo(() => parseBody(form.body), [form.body]);
  const stats = useMemo(() => bodyStats(blocks), [blocks]);
  const bodyIssues = useMemo(
    () => (isBuilderBody(form.body) ? [] : validateBody(blocks)),
    [blocks, form.body],
  );
  const autoExcerpt = useMemo(() => deriveExcerpt(blocks), [blocks]);

  const lint = useMemo(
    () =>
      lintArticle({
        title: form.title,
        body: form.body,
        metaTitle: form.metaTitle,
        metaDescription: form.metaDescription,
        excerpt: form.excerpt || autoExcerpt,
      }),
    [form.title, form.body, form.metaTitle, form.metaDescription, form.excerpt, autoExcerpt],
  );

  const revisionsFor = useServerFn(articleRevisionsFn);
  const { data: revisions } = useQuery({
    queryKey: ["article-revisions", form.id],
    enabled: !!form.id,
    queryFn: () => revisionsFor({ data: { articleId: form.id! } }),
  });

  const restore = useMutation({
    mutationFn: (revisionId: string) => restoreRevisionFn({ data: { revisionId } }),
    onSuccess: () => {
      setNotice(t("Revision restored", "সংস্করণ ফেরানো হয়েছে"));
      void qc.invalidateQueries({ queryKey: ["articles", merchantId] });
      void qc.invalidateQueries({ queryKey: ["article-revisions", form.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const failures = useRef(0);

  const save = useMutation({
    mutationFn: (autosave: boolean) => saveArticleFn({ data: toInput(autosave) }),
    onMutate: (autosave) => {
      if (autosave) setAutosaveState("saving");
    },
    onSuccess: (res, autosave) => {
      setError(null);
      failures.current = 0;
      void qc.invalidateQueries({ queryKey: ["articles", merchantId] });
      if (merchantId) drafts.clear(merchantId, form.id ?? "new");
      if (autosave) {
        setAutosaveState("saved");
        setForm((current) => ({ ...current, id: current.id ?? res.id }));
        setNotice(`${t("Autosaved", "স্বয়ংক্রিয় সংরক্ষণ")} ${new Date().toLocaleTimeString()}`);
        return;
      }
      setAutosaveState("idle");
      setNotice(`${t("Saved", "সংরক্ষিত")}: /blog/${res.slug}`);
      setForm(emptyForm);
    },
    onError: (e: Error, autosave) => {
      setNotice(null);
      const detail = readServerError(e.message);
      setError(detail ? t(detail.en, detail.bn) : e.message);
      if (detail?.field) {
        const node = document.querySelector<HTMLElement>(`[data-field="${detail.field}"]`);
        node?.focus();
      }
      if (autosave) {
        failures.current += 1;
        // Repeated autosave failure means the server is unhappy with this
        // document (or gone). Stop retrying and let the local draft hold it.
        setAutosaveState(failures.current >= AUTOSAVE_MAX_FAILURES ? "paused" : "idle");
      }
    },
  });

  /* ------------------------------------------------ autosave + local draft */

  const lastSavedHash = useRef(draftHash(payload));
  const savePending = save.isPending;

  useEffect(() => {
    if (!merchantId) return;
    const hash = draftHash(payload);
    if (hash === lastSavedHash.current) return;
    // Local copy first: it must survive even if the network never answers.
    drafts.write(merchantId, form.id ?? "new", payload, lastSavedHash.current);
    if (autosaveState === "paused" || savePending) return;
    if (!form.id || !form.title.trim() || !form.body.trim()) return;
    const timer = window.setTimeout(() => {
      lastSavedHash.current = hash;
      save.mutate(true);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, merchantId, form.id, autosaveState, savePending]);

  /** Warn before a tab close that would strand unsaved work. */
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (draftHash(payload) === lastSavedHash.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [payload]);

  const openArticle = useCallback(
    (row: NonNullable<typeof articles>[number]) => {
      const next: Form = {
        id: row.id,
        title: row.title,
        titleEn: row.title_en ?? "",
        slug: row.slug,
        excerpt: row.excerpt ?? "",
        body: row.body,
        coverImageUrl: row.cover_image_url ?? "",
        tags: (row.tags ?? []).join(", "),
        status: row.status,
        scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 16) : "",
        metaTitle: row.meta_title ?? "",
        metaDescription: row.meta_description ?? "",
        canonical: row.canonical ?? "",
        robots: row.robots,
        updatedAt: (row as { updated_at?: string }).updated_at ?? null,
      };
      setForm(next);
      setError(null);
      setAutosaveState("idle");
      failures.current = 0;
      const serverPayload = draftPayloadOf(next);
      lastSavedHash.current = draftHash(serverPayload);
      const stored = merchantId ? drafts.read(merchantId, row.id) : null;
      const offer = recoveryOffer(stored, serverPayload, next.updatedAt);
      setRecovery(offer.offer ? stored : null);
    },
    [drafts, merchantId],
  );

  // Deep links from the Content desk: `?edit=<id>` opens that post, `?new=1` a blank one.
  const deepLinked = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    const key = editId ?? (params.get("new") ? "new" : null);
    if (!key || deepLinked.current === key) return;
    if (key === "new") {
      deepLinked.current = key;
      setForm(emptyForm);
      return;
    }
    const row = articles?.find((a) => a.id === editId);
    if (!row) return;
    deepLinked.current = key;
    openArticle(row);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [articles, openArticle]);

  const remove = useMutation({
    mutationFn: (articleId: string) => deleteArticleFn({ data: { articleId } }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["articles", merchantId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const canSave = !save.isPending && bodyIssues.length === 0 && !!form.title.trim() && !!form.body.trim();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Blog writing", "ব্লগ লেখা")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Published articles appear at /blog/<slug> and are added to the sitemap.",
            "প্রকাশিত লেখা /blog/<slug> ঠিকানায় দেখা যায় এবং সাইটম্যাপে যুক্ত হয়।",
          )}
        </p>
      </header>

      <ErrorFrame message={error} />
      {notice && (
        <p role="status" className="rounded-fq-md border border-success bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {notice}
        </p>
      )}

      {recovery && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-fq-md border border-warning bg-warning-soft px-3 py-2 text-sm">
          <span>
            {t("Unsaved draft found from", "সংরক্ষণ না-হওয়া খসড়া পাওয়া গেছে")}{" "}
            {new Date(recovery.savedAt).toLocaleTimeString()}.
          </span>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setForm((current) => ({ ...current, ...draftPayloadOf(recovery) }));
              setRecovery(null);
            }}
          >
            {t("Restore draft", "খসড়া ফেরত")}
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              if (merchantId && form.id) drafts.clear(merchantId, form.id);
              setRecovery(null);
            }}
          >
            {t("Discard", "বাতিল")}
          </button>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <form
            id="article-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              lastSavedHash.current = draftHash(payload);
              save.mutate(false);
            }}
          >
            <Field label={t("Title", "শিরোনাম")}>
              <input
                data-field="title"
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("English title", "ইংরেজি শিরোনাম")} hint={t("Edited independently", "আলাদাভাবে সম্পাদিত")}>
                <input
                  className={inputClass}
                  value={form.titleEn}
                  onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                />
              </Field>
              <Field label={t("Permalink", "স্থায়ী লিঙ্ক")} hint={`/blog/${slugify(form.slug || form.titleEn || form.title) || "…"}`}>
                <input
                  data-field="slug"
                  className={inputClass}
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </Field>
            </div>

            <div data-field="body">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("Editor", "এডিটর")}</span>
                <div className="flex gap-1 rounded-fq-md border border-border p-0.5">
                  {(["classic", "builder"] as const).map((m) => {
                    const active = (isBuilderBody(form.body) ? "builder" : "classic") === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setForm((f) =>
                            (isBuilderBody(f.body) ? "builder" : "classic") === m
                              ? f
                              : {
                                  ...f,
                                  body:
                                    m === "builder"
                                      ? serializeBuilderBody(f.body.trim() ? emptyDoc() : starterDoc(f.titleEn || f.title || "New post"))
                                      : "",
                                },
                          )
                        }
                        className={`min-h-8 rounded-fq-sm px-3 text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {m === "classic" ? t("Classic editor", "ক্লাসিক এডিটর") : t("Page builder", "পেজ বিল্ডার")}
                      </button>
                    );
                  })}
                </div>
              </div>
              {isBuilderBody(form.body) ? (
                <PageBuilder
                  doc={(parseBuilderBody(form.body) ?? emptyDoc()) as BuilderDoc}
                  onChange={(doc) => setForm((f) => ({ ...f, body: serializeBuilderBody(doc) }))}
                  title={form.titleEn || form.title}
                />
              ) : (
                <ClassicEditor value={form.body} disabled={save.isPending} onChange={(body) => setForm((f) => ({ ...f, body }))} />
              )}
            </div>

            <Field
              label={t("Excerpt", "সারসংক্ষেপ")}
              hint={t("Empty uses the read-more split or the opening lines.", "খালি রাখলে “আরও পড়ুন” বিভাজন বা শুরুর লাইন ব্যবহার হবে।")}
            >
              <textarea
                className={`${inputClass} min-h-16`}
                placeholder={autoExcerpt}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </Field>
          </form>

          <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Article list</caption>
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("Title", "শিরোনাম")}</th>
                  <th scope="col" className="px-3 py-2">{t("Slug", "স্লাগ")}</th>
                  <th scope="col" className="px-3 py-2">{t("Views", "ভিউ")}</th>
                  <th scope="col" className="px-3 py-2">{t("Status", "অবস্থা")}</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(articles ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium">{a.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.slug}</td>
                    <td className="px-3 py-2 tabular-nums">{a.views}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        label={statusLabel[a.status] ? t(statusLabel[a.status].en, statusLabel[a.status].bn) : a.status}
                        tone={statusTone[a.status as keyof typeof statusTone] ?? "neutral"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button type="button" className={btnGhost} onClick={() => openArticle(a)}>
                          {t("Edit", "সম্পাদনা")}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(a.id)}
                        >
                          {t("Delete", "মুছুন")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(articles ?? []).length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                      {t("No articles yet.", "এখনও কোনো লেখা নেই।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Publish box + SEO box: the WordPress right rail, in WordPress order. */}
        <aside className="space-y-4">
          <section className="space-y-3 rounded-fq-md border border-border bg-card p-4">
            <h2 className="font-bangla-display text-base font-semibold">
              {form.id ? t("Publish", "প্রকাশ") : t("New article", "নতুন লেখা")}
            </h2>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {autosaveState === "saving" && t("Autosaving…", "স্বয়ংক্রিয় সংরক্ষণ হচ্ছে…")}
              {autosaveState === "saved" && t("Draft safe", "খসড়া নিরাপদ")}
              {autosaveState === "paused" &&
                t("Autosave paused after repeated failures — save manually.", "বারবার ব্যর্থ হওয়ায় স্বয়ংক্রিয় সংরক্ষণ থেমেছে — নিজে সংরক্ষণ করুন।")}
              {autosaveState === "idle" && `${stats.words} ${t("words", "শব্দ")} · ${stats.images} ${t("images", "ছবি")} · ${stats.links} ${t("links", "লিঙ্ক")}`}
            </p>
            <Field label={t("Status", "অবস্থা")}>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="draft">{t("Draft", "খসড়া")}</option>
                <option value="scheduled">{t("Scheduled", "নির্ধারিত")}</option>
                <option value="published">{t("Published", "প্রকাশিত")}</option>
                <option value="archived">{t("Archived", "আর্কাইভ")}</option>
              </select>
            </Field>
            {form.status === "scheduled" && (
              <Field label={t("Publish time", "প্রকাশের সময়")}>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.scheduledFor}
                  onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                />
              </Field>
            )}
            <Field label={t("Tags", "ট্যাগ")} hint={t("Separate with commas", "কমা দিয়ে আলাদা করুন")}>
              <input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
            <Field label={t("Cover image link", "কভার ছবির লিঙ্ক")}>
              <input
                className={inputClass}
                value={form.coverImageUrl}
                onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
              />
            </Field>
            <div className="flex gap-2">
              <button type="submit" form="article-form" className={btnPrimary} disabled={!canSave}>
                {t("Save", "সংরক্ষণ")}
              </button>
              {form.id && (
                <button type="button" className={btnGhost} onClick={() => setForm(emptyForm)}>
                  {t("Cancel", "বাতিল")}
                </button>
              )}
            </div>
            {bodyIssues.length > 0 && (
              <p className="text-xs text-danger">
                {t("Fix the body issues above before saving.", "সংরক্ষণের আগে উপরের সমস্যা ঠিক করুন।")}
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-fq-md border border-border bg-card p-4">
            <h2 className="font-bangla-display text-base font-semibold">{t("Search appearance", "সার্চে উপস্থিতি")}</h2>
            <Field label={t("Meta title", "মেটা শিরোনাম")} hint={`${(form.metaTitle || form.title).length}/60`}>
              <input
                className={inputClass}
                value={form.metaTitle}
                onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
              />
            </Field>
            <Field label={t("Meta description", "মেটা বিবরণ")} hint={`${form.metaDescription.length}/160`}>
              <textarea
                className={`${inputClass} min-h-16`}
                value={form.metaDescription}
                onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
              />
            </Field>
            <Field label={t("Canonical", "ক্যানোনিকাল")}>
              <input
                className={inputClass}
                value={form.canonical}
                onChange={(e) => setForm({ ...form, canonical: e.target.value })}
              />
            </Field>
            <Field label="Robots">
              <select
                className={inputClass}
                value={form.robots}
                onChange={(e) => setForm({ ...form, robots: e.target.value })}
              >
                <option value="index,follow">index,follow</option>
                <option value="noindex,follow">noindex,follow</option>
                <option value="noindex,nofollow">noindex,nofollow</option>
              </select>
            </Field>
            {lint.length > 0 && (
              <ul className="space-y-1 rounded-fq-md border border-warning bg-warning-soft px-3 py-2 text-sm">
                {lint.map((n) => (
                  <li key={n.code}>{t(n.en, n.bn)}</li>
                ))}
              </ul>
            )}
          </section>

          {form.id && <ArticleTermPicker articleId={form.id} />}

          {form.id && (
            <RevisionCompare
              revisions={revisions ?? []}
              restoring={restore.isPending}
              onRestore={(revisionId) => restore.mutate(revisionId)}
            />
          )}
        </aside>
      </section>

      <TaxonomyDesk />
    </div>
  );
}
