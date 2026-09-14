/**
 * Phase 7.4 — store-wide SEO templates + redirect manager.
 *
 * Templates are per content type and interpolate a fixed variable set, so a
 * merchant sets the pattern once instead of authoring 2,000 titles. Redirects
 * are the manual half of the URL lifecycle: renames record themselves, but a
 * merchant still needs to point an old campaign URL somewhere.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Field, StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import {
  seoRedirectDeleteFn,
  seoRedirectSaveFn,
  seoTemplateSaveFn,
  seoTemplatesFn,
} from "@/lib/seo.functions";
import { SEO_DESC_MAX, SEO_TITLE_MAX } from "@/lib/seo-analysis";
import { SEO_TEMPLATE_VARS, renderSeoTemplate, templateIssues } from "@/lib/seo-answers";

type TemplateType = "product" | "collection" | "page" | "article";

const TYPE_LABEL: Record<TemplateType, { en: string; bn: string }> = {
  product: { en: "Products", bn: "পণ্য" },
  collection: { en: "Collections", bn: "কালেকশন" },
  page: { en: "Pages", bn: "পৃষ্ঠা" },
  article: { en: "Articles", bn: "আর্টিকেল" },
};

/** Sample values so the preview shows a real snippet, not variable names. */
const SAMPLE = {
  store: "Framique Store",
  title: "Anker 30W Charger",
  category: "Chargers",
  brand: "Anker",
  price: "৳1,890",
  city: "Dhaka",
};

export function SeoTemplatesPanel({ storeName }: { storeName?: string }) {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const list = useServerFn(seoTemplatesFn);
  const saveTemplate = useServerFn(seoTemplateSaveFn);
  const saveRedirect = useServerFn(seoRedirectSaveFn);
  const removeRedirect = useServerFn(seoRedirectDeleteFn);

  const query = useQuery({ queryKey: ["seo", "templates"], queryFn: () => list() });

  const [type, setType] = useState<TemplateType>("product");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dirty, setDirty] = useState(false);

  const current = query.data?.templates.find((row) => row.entityType === type);
  useEffect(() => {
    setTitle(current?.titleTemplate ?? "");
    setDesc(current?.descriptionTemplate ?? "");
    setDirty(false);
  }, [current?.titleTemplate, current?.descriptionTemplate, type]);

  const issues = useMemo(() => [...templateIssues(title), ...templateIssues(desc)], [title, desc]);
  const sample = { ...SAMPLE, store: storeName || SAMPLE.store };
  const previewTitle = renderSeoTemplate(title, sample, SEO_TITLE_MAX);
  const previewDesc = renderSeoTemplate(desc, sample, SEO_DESC_MAX);

  const templateMutation = useMutation({
    mutationFn: () =>
      saveTemplate({ data: { entityType: type, titleTemplate: title, descriptionTemplate: desc } }),
    onSuccess: () => {
      setDirty(false);
      toast.success(t("Template saved", "টেমপ্লেট সংরক্ষিত হয়েছে"));
      void qc.invalidateQueries({ queryKey: ["seo", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<301 | 410>(301);

  const redirectMutation = useMutation({
    mutationFn: () => saveRedirect({ data: { fromPath: from, toPath: to, status } }),
    onSuccess: () => {
      setFrom("");
      setTo("");
      toast.success(t("Redirect saved", "রিডাইরেক্ট সংরক্ষিত হয়েছে"));
      void qc.invalidateQueries({ queryKey: ["seo", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeRedirect({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["seo", "templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const redirects = query.data?.redirects ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">{t("Title & description templates", "শিরোনাম ও বিবরণ টেমপ্লেট")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Applied wherever a page has no hand-written override.",
                "যেসব পৃষ্ঠায় নিজের লেখা মেটা নেই, সেখানে এটি প্রযোজ্য।",
              )}
            </p>
          </div>
          <button
            type="button"
            className={btnPrimary}
            disabled={!dirty || issues.length > 0 || templateMutation.isPending}
            onClick={() => templateMutation.mutate()}
          >
            {templateMutation.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save template", "টেমপ্লেট সংরক্ষণ")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("Content type", "কনটেন্ট ধরন")}>
          {(Object.keys(TYPE_LABEL) as TemplateType[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={type === key}
              onClick={() => setType(key)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                type === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              }`}
            >
              {t(TYPE_LABEL[key].en, TYPE_LABEL[key].bn)}
            </button>
          ))}
        </div>

        <Field label={t("Title template", "শিরোনাম টেমপ্লেট")}>
          <input
            className={inputClass}
            value={title}
            maxLength={300}
            placeholder="{{title}} | {{brand}} | {{store}}"
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <Field label={t("Description template", "বিবরণ টেমপ্লেট")}>
          <textarea
            className={`${inputClass} min-h-20`}
            value={desc}
            maxLength={600}
            placeholder="Buy {{title}} from {{store}} — {{price}}, delivered in {{city}}."
            onChange={(e) => {
              setDesc(e.target.value);
              setDirty(true);
            }}
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          {t("Variables:", "ভেরিয়েবল:")}{" "}
          {SEO_TEMPLATE_VARS.map((v) => `{{${v}}}`).join(" · ")}
        </p>

        {issues.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        <div className="rounded-md bg-muted/40 p-3" aria-label={t("Template preview", "টেমপ্লেট প্রিভিউ")}>
          <p className="text-[15px] font-medium text-primary">
            {previewTitle || t("No title template", "কোনো শিরোনাম টেমপ্লেট নেই")}
          </p>
          <p className="text-sm text-muted-foreground">{previewDesc}</p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {previewTitle.length}/{SEO_TITLE_MAX} · {previewDesc.length}/{SEO_DESC_MAX}
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border p-4">
        <div>
          <h3 className="font-medium">{t("Redirect manager", "রিডাইরেক্ট ম্যানেজার")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "301 moves a URL; 410 tells crawlers it is gone for good. Renames record themselves.",
              "৩০১ মানে ইউআরএল সরেছে; ৪১০ মানে স্থায়ীভাবে নেই। নাম বদলালে নিজে থেকেই যুক্ত হয়।",
            )}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
          <input
            className={inputClass}
            value={from}
            placeholder="/store/acme/p/old-slug"
            aria-label={t("From path", "পুরোনো পাথ")}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className={inputClass}
            value={to}
            disabled={status === 410}
            placeholder="/store/acme/p/new-slug"
            aria-label={t("To path", "নতুন পাথ")}
            onChange={(e) => setTo(e.target.value)}
          />
          <select
            className={inputClass}
            value={status}
            aria-label={t("Redirect type", "রিডাইরেক্টের ধরন")}
            onChange={(e) => setStatus(Number(e.target.value) === 410 ? 410 : 301)}
          >
            <option value={301}>301</option>
            <option value={410}>410</option>
          </select>
          <button
            type="button"
            className={btnPrimary}
            disabled={!from.trim() || (status === 301 && !to.trim()) || redirectMutation.isPending}
            onClick={() => redirectMutation.mutate()}
          >
            {t("Add", "যোগ")}
          </button>
        </div>

        {query.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}
        {!query.isLoading && redirects.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("No redirects yet.", "এখনো কোনো রিডাইরেক্ট নেই।")}</p>
        )}
        <ul className="divide-y divide-border">
          {redirects.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <StatusPill tone={row.status === 410 ? "danger" : "success"} label={String(row.status)} />
              <span className="min-w-0 break-all font-mono text-xs">{row.fromPath}</span>
              {row.status === 301 && (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className="min-w-0 break-all font-mono text-xs">{row.toPath}</span>
                </>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {row.entityType} ·{" "}
                {new Date(row.createdAt).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB")}
              </span>
              <button type="button" className={btnGhost} onClick={() => deleteMutation.mutate(row.id)}>
                {t("Remove", "মুছুন")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
