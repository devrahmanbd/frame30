/**
 * Phase 9.1 — the taxonomy desk and the per-article term picker.
 *
 * What makes this more than a CRUD table:
 *
 *  - **A slug change is announced, not silent.** When the server reports a moved
 *    archive it comes back as `movedFrom`, and the desk says so — "old URL now
 *    redirects" — because a merchant who renames a category is entitled to know
 *    a redirect was created on their behalf.
 *  - **Empty terms are flagged as `noindex`.** The reader surface refuses to
 *    index a thin archive, so the desk shows which terms are in that state
 *    instead of letting a merchant wonder why their category never ranks.
 *  - **Errors are field-targeted.** `code|field|en|bn` from the server is parsed
 *    and shown against the field it belongs to, in the merchant's language.
 *  - **Destructive actions state their consequence.** Delete tells you how many
 *    children and articles will be relinked, and where the archive URL will
 *    redirect, before you confirm.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  articleTermsFn,
  deleteTermFn,
  refreshTermCountsFn,
  reorderTermsFn,
  saveTermFn,
  setArticleTermsFn,
  taxonomyStateFn,
} from "@/lib/blog-taxonomy.functions";
import { flattenTermTree, slugifyTerm, type TermKind, type TermNode } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";

type FieldError = { field: string; message: string } | null;

/** Parse the shared `code|field|en|bn` envelope; fall back to the raw message. */
function readError(error: unknown, bn: boolean): FieldError {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const parts = raw.split("|");
  if (parts.length === 4) return { field: parts[1]!, message: bn ? parts[3]! : parts[2]! };
  return raw ? { field: "", message: raw } : null;
}

const emptyForm = {
  id: null as string | null,
  kind: "category" as TermKind,
  name: "",
  nameEn: "",
  slug: "",
  description: "",
  parentId: null as string | null,
  sortOrder: 0,
  coverImageUrl: "",
  metaTitle: "",
  metaDescription: "",
  robotsIndex: true,
};

export function TaxonomyDesk() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const loadState = useServerFn(taxonomyStateFn);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<FieldError>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["blog-taxonomy"],
    queryFn: () => loadState({}),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["blog-taxonomy"] });

  const save = useMutation({
    mutationFn: () =>
      saveTermFn({
        data: {
          ...form,
          slug: form.slug || slugifyTerm(form.nameEn || form.name),
          parentId: form.kind === "category" ? form.parentId : null,
        },
      }),
    onSuccess: (result) => {
      setError(null);
      setNotice(
        result.movedFrom
          ? t(
              `Saved. ${result.movedFrom} now redirects to the new archive URL.`,
              `সংরক্ষিত। ${result.movedFrom} এখন নতুন ঠিকানায় রিডিরেক্ট হবে।`,
            )
          : t("Term saved.", "টার্ম সংরক্ষিত হয়েছে।"),
      );
      setForm(emptyForm);
      void invalidate();
    },
    onError: (e: unknown) => {
      setNotice(null);
      setError(readError(e, lang === "bn"));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTermFn({ data: { id } }),
    onSuccess: (result) => {
      setError(null);
      setPendingDelete(null);
      setNotice(
        t(
          `Deleted. ${result.relinkedChildren} sub-categories and ${result.relinkedArticles} article links moved; the old archive redirects to ${result.redirectTo}.`,
          `মুছে ফেলা হয়েছে। ${result.relinkedChildren}টি সাব-ক্যাটাগরি ও ${result.relinkedArticles}টি লেখার লিংক সরানো হয়েছে; পুরোনো ঠিকানা ${result.redirectTo}-এ যাবে।`,
        ),
      );
      void invalidate();
    },
    onError: (e: unknown) => setError(readError(e, lang === "bn")),
  });

  const reorder = useMutation({
    mutationFn: (order: { id: string; sortOrder: number; parentId: string | null }[]) =>
      reorderTermsFn({ data: { order } }),
    onSuccess: () => void invalidate(),
    onError: (e: unknown) => setError(readError(e, lang === "bn")),
  });

  const recount = useMutation({
    mutationFn: () => refreshTermCountsFn({}),
    onSuccess: (result) => {
      setNotice(t(`Recounted ${result.updated} terms.`, `${result.updated}টি টার্মের গণনা হালনাগাদ হয়েছে।`));
      void invalidate();
    },
  });

  const categories = useMemo(() => flattenTermTree(state.data?.categories ?? []), [state.data]);
  const tags = state.data?.tags ?? [];
  const emptyIds = new Set(state.data?.emptyTermIds ?? []);

  /** Swap a term with its previous/next visible sibling. */
  const move = (node: TermNode, direction: -1 | 1) => {
    const siblings = categories.filter((item) => (item.parent_id ?? null) === (node.parent_id ?? null));
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = siblings[index + direction];
    if (!target) return;
    reorder.mutate([
      { id: node.id, sortOrder: target.sort_order ?? index + direction, parentId: node.parent_id ?? null },
      { id: target.id, sortOrder: node.sort_order ?? index, parentId: target.parent_id ?? null },
    ]);
  };

  return (
    <section className="space-y-4 rounded-fq-md border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bangla-display text-lg font-semibold">
            {t("Categories & tags", "ক্যাটাগরি ও ট্যাগ")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Archives live at /blog/category/<slug> and /blog/tag/<slug>. Renaming a slug creates a 301 automatically.",
              "আর্কাইভ পাওয়া যাবে /blog/category/<slug> ও /blog/tag/<slug> ঠিকানায়। স্লাগ বদলালে স্বয়ংক্রিয়ভাবে ৩০১ রিডিরেক্ট তৈরি হয়।",
            )}
          </p>
        </div>
        <button type="button" className={btnGhost} disabled={recount.isPending} onClick={() => recount.mutate()}>
          {recount.isPending ? t("Recounting…", "গণনা চলছে…") : t("Recount articles", "লেখা গণনা করুন")}
        </button>
      </header>

      <ErrorFrame message={error?.message ?? null} />
      {notice && (
        <p role="status" className="rounded-fq-md border border-success bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {notice}
        </p>
      )}

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("Kind", "ধরন")}>
          <select
            className={inputClass}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as TermKind, parentId: null })}
          >
            <option value="category">{t("Category", "ক্যাটাগরি")}</option>
            <option value="tag">{t("Tag", "ট্যাগ")}</option>
          </select>
        </Field>
        <Field label={t("Name", "নাম")}>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label={t("English name", "ইংরেজি নাম")} hint={t("Used for the slug", "স্লাগের জন্য ব্যবহৃত")}>
          <input
            className={inputClass}
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
          />
        </Field>
        <Field
          label={t("Slug", "স্লাগ")}
          hint={`/blog/${form.kind === "tag" ? "tag" : "category"}/${slugifyTerm(form.slug || form.nameEn || form.name) || "…"}`}
        >
          <input
            className={inputClass}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </Field>
        {form.kind === "category" && (
          <Field label={t("Parent category", "প্যারেন্ট ক্যাটাগরি")}>
            <select
              className={inputClass}
              value={form.parentId ?? ""}
              onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}
            >
              <option value="">{t("None (top level)", "নেই (শীর্ষ স্তর)")}</option>
              {categories
                .filter((node) => node.id !== form.id)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {"— ".repeat(node.depth - 1)}
                    {node.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label={t("Description", "বর্ণনা")}>
          <textarea
            className={`${inputClass} min-h-16`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label={t("Archive meta title", "আর্কাইভ মেটা শিরোনাম")}>
          <input
            className={inputClass}
            value={form.metaTitle}
            onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
          />
        </Field>
        <Field label={t("Archive meta description", "আর্কাইভ মেটা বর্ণনা")}>
          <input
            className={inputClass}
            value={form.metaDescription}
            onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.robotsIndex}
            onChange={(e) => setForm({ ...form, robotsIndex: e.target.checked })}
          />
          {t("Allow search engines to index this archive", "সার্চ ইঞ্জিনকে এই আর্কাইভ ইনডেক্স করতে দিন")}
        </label>
        <div className="flex items-center gap-2 md:col-span-2">
          <button type="submit" className={btnPrimary} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : form.id ? t("Update term", "টার্ম হালনাগাদ") : t("Add term", "টার্ম যোগ")}
          </button>
          {form.id && (
            <button type="button" className={btnGhost} onClick={() => setForm(emptyForm)}>
              {t("Cancel", "বাতিল")}
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-fq-md border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("Taxonomy terms", "ট্যাক্সোনমি টার্ম")}</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("Term", "টার্ম")}</th>
              <th className="px-3 py-2">{t("Archive", "আর্কাইভ")}</th>
              <th className="px-3 py-2">{t("Articles", "লেখা")}</th>
              <th className="px-3 py-2">{t("Index", "ইনডেক্স")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {state.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {t("Loading…", "লোড হচ্ছে…")}
                </td>
              </tr>
            )}
            {categories.map((node) => (
              <tr key={node.id} className="border-b border-border/60">
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + (node.depth - 1) * 18}px` }}>
                  {node.name}
                  {node.name_en ? <span className="ml-2 text-xs text-muted-foreground">{node.name_en}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">/blog/category/{node.slug}</td>
                <td className="px-3 py-2">{node.article_count ?? 0}</td>
                <td className="px-3 py-2">
                  {node.robots_index === false || emptyIds.has(node.id) ? (
                    <StatusPill tone="warning" label="noindex" />
                  ) : (
                    <StatusPill tone="success" label={t("indexable", "ইনডেক্সযোগ্য")} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className={btnGhost} aria-label={t("Move up", "উপরে")} onClick={() => move(node, -1)}>
                      ↑
                    </button>
                    <button type="button" className={btnGhost} aria-label={t("Move down", "নিচে")} onClick={() => move(node, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        setForm({
                          id: node.id,
                          kind: "category",
                          name: node.name,
                          nameEn: node.name_en ?? "",
                          slug: node.slug,
                          description: node.description ?? "",
                          parentId: node.parent_id ?? null,
                          sortOrder: node.sort_order ?? 0,
                          coverImageUrl: node.cover_image_url ?? "",
                          metaTitle: node.meta_title ?? "",
                          metaDescription: node.meta_description ?? "",
                          robotsIndex: node.robots_index !== false,
                        })
                      }
                    >
                      {t("Edit", "সম্পাদনা")}
                    </button>
                    {pendingDelete === node.id ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(node.id)}
                      >
                        {t("Confirm delete", "নিশ্চিত করুন")}
                      </button>
                    ) : (
                      <button type="button" className={btnGhost} onClick={() => setPendingDelete(node.id)}>
                        {t("Delete", "মুছুন")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b border-border/60">
                <td className="px-3 py-2">#{tag.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">/blog/tag/{tag.slug}</td>
                <td className="px-3 py-2">{tag.article_count ?? 0}</td>
                <td className="px-3 py-2">
                  {tag.robots_index === false || emptyIds.has(tag.id) ? (
                    <StatusPill tone="warning" label="noindex" />
                  ) : (
                    <StatusPill tone="success" label={t("indexable", "ইনডেক্সযোগ্য")} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        setForm({
                          ...emptyForm,
                          id: tag.id,
                          kind: "tag",
                          name: tag.name,
                          nameEn: tag.name_en ?? "",
                          slug: tag.slug,
                          description: tag.description ?? "",
                          metaTitle: tag.meta_title ?? "",
                          metaDescription: tag.meta_description ?? "",
                          robotsIndex: tag.robots_index !== false,
                        })
                      }
                    >
                      {t("Edit", "সম্পাদনা")}
                    </button>
                    {pendingDelete === tag.id ? (
                      <button type="button" className={btnPrimary} disabled={remove.isPending} onClick={() => remove.mutate(tag.id)}>
                        {t("Confirm delete", "নিশ্চিত করুন")}
                      </button>
                    ) : (
                      <button type="button" className={btnGhost} onClick={() => setPendingDelete(tag.id)}>
                        {t("Delete", "মুছুন")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!state.isLoading && !categories.length && !tags.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {t("No categories or tags yet.", "এখনো কোনো ক্যাটাগরি বা ট্যাগ নেই।")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Per-article term picker.
 *
 * The primary category is a radio, not a checkbox: exactly one primary is what
 * breadcrumbs and the card chip read, and "two primaries" is not a state the
 * reader surface can render. Selecting a primary implies membership, so the
 * checkbox follows automatically.
 */
export function ArticleTermPicker({ articleId }: { articleId: string }) {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const loadState = useServerFn(taxonomyStateFn);
  const loadAssigned = useServerFn(articleTermsFn);
  const [error, setError] = useState<FieldError>(null);
  const [saved, setSaved] = useState(false);

  const state = useQuery({ queryKey: ["blog-taxonomy"], queryFn: () => loadState({}), staleTime: 30_000 });
  const assigned = useQuery({
    queryKey: ["article-terms", articleId],
    queryFn: () => loadAssigned({ data: { articleId } }),
  });

  const [draft, setDraft] = useState<{ termId: string; isPrimary: boolean }[] | null>(null);
  const current = draft ?? assigned.data ?? [];

  const persist = useMutation({
    mutationFn: (terms: { termId: string; isPrimary: boolean }[]) =>
      setArticleTermsFn({ data: { articleId, terms } }),
    onSuccess: (result) => {
      setError(null);
      setSaved(true);
      setDraft(result.terms);
      void qc.invalidateQueries({ queryKey: ["article-terms", articleId] });
      void qc.invalidateQueries({ queryKey: ["blog-taxonomy"] });
    },
    onError: (e: unknown) => {
      setSaved(false);
      setError(readError(e, lang === "bn"));
    },
  });

  const toggle = (termId: string) => {
    setSaved(false);
    const next = current.some((item) => item.termId === termId)
      ? current.filter((item) => item.termId !== termId)
      : [...current, { termId, isPrimary: false }];
    setDraft(next);
  };

  const setPrimary = (termId: string) => {
    setSaved(false);
    const withTerm = current.some((item) => item.termId === termId)
      ? current
      : [...current, { termId, isPrimary: false }];
    setDraft(withTerm.map((item) => ({ ...item, isPrimary: item.termId === termId })));
  };

  const options = state.data?.options ?? [];
  const categories = options.filter((option) => option.kind === "category");
  const tags = options.filter((option) => option.kind === "tag");

  return (
    <section className="space-y-3 rounded-fq-md border border-border bg-card p-4">
      <h2 className="font-bangla-display text-base font-semibold">{t("Categories & tags", "ক্যাটাগরি ও ট্যাগ")}</h2>
      <ErrorFrame message={error?.message ?? null} />
      {!options.length ? (
        <p className="text-sm text-muted-foreground">
          {t("Create a category below to file this article.", "এই লেখাটি সাজাতে নিচে একটি ক্যাটাগরি তৈরি করুন।")}
        </p>
      ) : null}

      {categories.length ? (
        <fieldset className="space-y-1">
          <legend className="text-xs uppercase text-muted-foreground">{t("Categories", "ক্যাটাগরি")}</legend>
          {categories.map((option) => {
            const entry = current.find((item) => item.termId === option.id);
            return (
              <div key={option.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`term-${option.id}`}
                  checked={!!entry}
                  onChange={() => toggle(option.id)}
                />
                <label htmlFor={`term-${option.id}`} className="flex-1">
                  {option.label}
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name={`primary-${articleId}`}
                    checked={!!entry?.isPrimary}
                    onChange={() => setPrimary(option.id)}
                  />
                  {t("primary", "প্রধান")}
                </label>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {tags.length ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="w-full text-xs uppercase text-muted-foreground">{t("Tags", "ট্যাগ")}</legend>
          {tags.map((option) => {
            const active = current.some((item) => item.termId === option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(option.id)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                #{option.label}
              </button>
            );
          })}
        </fieldset>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={persist.isPending || !options.length}
          onClick={() => persist.mutate(current)}
        >
          {persist.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save terms", "টার্ম সংরক্ষণ")}
        </button>
        {saved ? (
          <span role="status" className="text-xs text-success-foreground">
            {t("Saved", "সংরক্ষিত")}
          </span>
        ) : null}
      </div>
    </section>
  );
}