import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { AstIssue, TemplateKey, ThemeAst } from "@/lib/builder-ast";
import {
  EMPTY_PAGE_SEO,
  SEO_DESC_PX_MAX,
  SEO_TITLE_PX_MAX,
  parsePageSeo,
  scoreBuilderSeo,
  type PageSeo,
} from "@/lib/builder-seo";
import { templateSeoListFn, templateSeoSaveFn } from "@/lib/builder-seo.functions";
import { useLang } from "@/lib/i18n";

type Stored = { template: TemplateKey; seo: PageSeo; score: number; revision: number };

/**
 * Phase 3 — the per-page SEO drawer.
 *
 * Scored with the same pure analyser the server uses, so the number the
 * merchant sees while typing is exactly the number that gets stored. Saves are
 * revision-checked: a conflict reloads rather than clobbering a colleague.
 */
export function SeoDrawer({
  themeId,
  template,
  ast,
  issues,
  storeName,
}: {
  themeId: string | null;
  template: TemplateKey;
  ast: ThemeAst;
  issues: readonly AstIssue[];
  storeName: string;
}) {
  const { t } = useLang();
  const client = useQueryClient();
  const list = useServerFn(templateSeoListFn);
  const save = useServerFn(templateSeoSaveFn);
  const [draft, setDraft] = useState<PageSeo>(EMPTY_PAGE_SEO);
  const [dirty, setDirty] = useState(false);

  const stored = useQuery({
    queryKey: ["builder-template-seo", themeId],
    queryFn: async () => (await list({ data: { themeId } })) as unknown as Stored[],
    enabled: Boolean(themeId),
    staleTime: 30_000,
  });

  const record = useMemo(
    () => (stored.data ?? []).find((row) => row.template === template) ?? null,
    [stored.data, template],
  );

  // Switching template discards nothing: an unsaved draft belongs to the
  // template it was typed against, so it is reloaded from the stored row.
  useEffect(() => {
    setDraft(record ? parsePageSeo(record.seo) : EMPTY_PAGE_SEO);
    setDirty(false);
  }, [record, template]);

  const report = useMemo(
    () => scoreBuilderSeo({ seo: draft, ast, template, issues, storeName }),
    [draft, ast, template, issues, storeName],
  );

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          themeId,
          template,
          expectedRevision: record?.revision ?? 0,
          seo: draft,
          ast,
          storeName,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      toast.success(t("Page SEO saved.", "পেজ SEO সেভ হয়েছে।"));
      await client.invalidateQueries({ queryKey: ["builder-template-seo", themeId] });
    },
    onError: async (error: unknown) => {
      const message = String((error as { message?: string })?.message ?? error);
      if (message.includes("conflict")) {
        toast.error(t("Someone else saved this page — reloading.", "অন্য কেউ সেভ করেছেন — রিলোড হচ্ছে।"));
        await client.invalidateQueries({ queryKey: ["builder-template-seo", themeId] });
        return;
      }
      toast.error(t("Could not save page SEO.", "পেজ SEO সেভ করা যায়নি।"));
    },
  });

  const field = (
    key: keyof PageSeo,
    label: { en: string; bn: string },
    options: { textarea?: boolean; placeholder?: string } = {},
  ) => (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{t(label.en, label.bn)}</span>
      {options.textarea ? (
        <textarea
          value={String(draft[key] ?? "")}
          rows={3}
          placeholder={options.placeholder}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [key]: e.target.value }));
            setDirty(true);
          }}
          className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          type="text"
          value={String(draft[key] ?? "")}
          placeholder={options.placeholder}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [key]: e.target.value }));
            setDirty(true);
          }}
          className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );

  return (
    <section aria-label={t("Page SEO", "পেজ SEO")} className="space-y-3 rounded-fq-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("Page SEO", "পেজ SEO")}</h2>
        <span
          className={`rounded-fq-md px-2 py-1 text-xs font-semibold ${
            report.score >= 80
              ? "bg-success-soft text-success-foreground"
              : report.score >= 55
                ? "bg-warning-soft text-warning-foreground"
                : "bg-danger-soft text-danger-foreground"
          }`}
        >
          {report.score}/100
        </span>
      </header>

      {/* SERP preview, measured in pixels because that is how Google truncates. */}
      <div className="space-y-1 rounded-fq-md border border-border p-3">
        <p className="truncate text-sm text-primary">{report.preview.title || t("Untitled page", "শিরোনামহীন পেজ")}</p>
        <p className="text-xs text-muted-foreground">
          {draft.canonical || t("No canonical URL set", "ক্যানোনিকাল URL নেই")}
        </p>
        <p className="line-clamp-2 text-xs">
          {report.preview.description || t("No description yet.", "এখনো বর্ণনা নেই।")}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {t(
            `Title ${report.preview.titlePx}/${SEO_TITLE_PX_MAX}px · Description ${report.preview.descriptionPx}/${SEO_DESC_PX_MAX}px`,
            `টাইটেল ${report.preview.titlePx}/${SEO_TITLE_PX_MAX}px · বর্ণনা ${report.preview.descriptionPx}/${SEO_DESC_PX_MAX}px`,
          )}
        </p>
      </div>

      <div className="space-y-2">
        {field("title", { en: "Search title", bn: "সার্চ টাইটেল" })}
        {field("description", { en: "Search description", bn: "সার্চ বর্ণনা" }, { textarea: true })}
        {field("canonical", { en: "Canonical URL", bn: "ক্যানোনিকাল URL" }, { placeholder: "https://" })}
        {field("focusKeyword", { en: "Focus keyword", bn: "মূল কীওয়ার্ড" })}
        {field("ogTitle", { en: "Social title", bn: "সোশ্যাল টাইটেল" })}
        {field("ogDescription", { en: "Social description", bn: "সোশ্যাল বর্ণনা" }, { textarea: true })}
        {field("ogImage", { en: "Social image URL", bn: "সোশ্যাল ইমেজ URL" }, { placeholder: "https://" })}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={draft.noindex}
            onChange={(e) => {
              setDraft((d) => ({ ...d, noindex: e.target.checked }));
              setDirty(true);
            }}
          />
          {t("Hide this page from search engines", "এই পেজ সার্চ ইঞ্জিন থেকে লুকান")}
        </label>
      </div>

      <ul className="space-y-1" aria-label={t("SEO checks", "SEO চেক")}>
        {report.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-xs">
            <span
              aria-hidden
              className={`mt-0.5 inline-block size-2 shrink-0 rounded-full ${
                check.status === "pass" ? "bg-success" : check.status === "warn" ? "bg-warning" : "bg-danger"
              }`}
            />
            <span>
              <span className="font-medium">{check.label}</span> — {check.hint}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={!themeId || mutation.isPending || !dirty}
        onClick={() => mutation.mutate()}
        className="rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {mutation.isPending ? t("Saving…", "সেভ হচ্ছে…") : t("Save page SEO", "পেজ SEO সেভ")}
      </button>
    </section>
  );
}
