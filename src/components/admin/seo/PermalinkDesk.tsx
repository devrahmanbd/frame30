/**
 * Phase 3 — Permalinks, Redirects and the 404 log, as one desk.
 *
 * Three panels that share one mental model: the pattern decides where URLs
 * live, the redirect table decides where old URLs go, and the 404 log is the
 * queue of URLs that still have no answer. Every destructive action is a
 * two-step (preview then apply), because a permalink change is the single most
 * damaging button in an SEO product.
 *
 * Client-side rules:
 *  - never apply without a preview the merchant has seen
 *  - never render more than a page of redirects (server paginates)
 *  - CSV import/export happens in the browser via Blob, no extra round trip
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import {
  missingDismissFn,
  missingResolveFn,
  permalinkApplyFn,
  permalinkPreviewFn,
  permalinkStateFn,
  redirectDeleteFn,
  redirectExportFn,
  redirectImportFn,
  redirectListFn,
  redirectSaveFn,
} from "@/lib/permalink.functions";
import { ARTICLE_PATTERNS, DEFAULT_PERMALINKS, type PermalinkSettings } from "@/lib/permalink";

type Plan = Awaited<ReturnType<typeof permalinkPreviewFn>>;

const PATTERN_LABELS: Record<string, { en: string; bn: string }> = {
  "/%slug%": { en: "Post name", bn: "পোস্টের নাম" },
  "/%year%/%slug%": { en: "Year + name", bn: "বছর + নাম" },
  "/%year%/%month%/%slug%": { en: "Year / month / name", bn: "বছর / মাস / নাম" },
  "/%year%/%month%/%day%/%slug%": { en: "Day and name", bn: "দিন ও নাম" },
  "/%category%/%slug%": { en: "Category + name", bn: "ক্যাটাগরি + নাম" },
};

function errText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function PermalinkDesk() {
  const { lang } = useLang();
  const bn = lang === "bn";
  const qc = useQueryClient();

  const state = useServerFn(permalinkStateFn);
  const preview = useServerFn(permalinkPreviewFn);
  const apply = useServerFn(permalinkApplyFn);
  const listRedirects = useServerFn(redirectListFn);
  const saveRedirect = useServerFn(redirectSaveFn);
  const removeRedirects = useServerFn(redirectDeleteFn);
  const importCsv = useServerFn(redirectImportFn);
  const exportCsv = useServerFn(redirectExportFn);
  const resolveMissing = useServerFn(missingResolveFn);
  const dismissMissing = useServerFn(missingDismissFn);

  const stateQuery = useQuery({ queryKey: ["permalinks", "state"], queryFn: () => state() });

  const [form, setForm] = useState<PermalinkSettings | null>(null);
  const settings = form ?? stateQuery.data?.settings ?? DEFAULT_PERMALINKS;
  const [plan, setPlan] = useState<Plan | null>(null);

  const dirty = useMemo(() => {
    const saved = stateQuery.data?.settings ?? DEFAULT_PERMALINKS;
    return (Object.keys(saved) as (keyof PermalinkSettings)[]).some((k) => saved[k] !== settings[k]);
  }, [settings, stateQuery.data]);

  const set = useCallback(<K extends keyof PermalinkSettings>(key: K, value: PermalinkSettings[K]) => {
    setPlan(null);
    setForm((current) => ({ ...(current ?? DEFAULT_PERMALINKS), ...settings, [key]: value }));
  }, [settings]);

  const previewMutation = useMutation({
    mutationFn: () => preview({ data: settings }),
    onSuccess: (result) => setPlan(result),
    onError: (error) => toast.error(errText(error)),
  });

  const applyMutation = useMutation({
    mutationFn: () => apply({ data: settings }),
    onSuccess: (result) => {
      toast.success(
        bn
          ? `প্যাটার্ন সংরক্ষিত — ${result.redirects}টি রিডাইরেক্ট তৈরি হয়েছে।`
          : `Pattern saved — ${result.redirects} redirect(s) created.`,
      );
      setPlan(null);
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["permalinks"] });
    },
    onError: (error) => toast.error(errText(error)),
  });

  /* ------------------------------ redirects ------------------------------ */

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const redirectQuery = useQuery({
    queryKey: ["permalinks", "redirects", search, page],
    queryFn: () => listRedirects({ data: { search: search || undefined, page, pageSize: 25 } }),
  });

  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newStatus, setNewStatus] = useState<301 | 302 | 410>(301);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshRedirects = () => {
    setSelectedIds([]);
    void qc.invalidateQueries({ queryKey: ["permalinks"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      saveRedirect({ data: { fromPath: newFrom, toPath: newTo, status: newStatus } }),
    onSuccess: () => {
      setNewFrom("");
      setNewTo("");
      toast.success(bn ? "রিডাইরেক্ট সংরক্ষিত।" : "Redirect saved.");
      refreshRedirects();
    },
    onError: (error) => toast.error(errText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeRedirects({ data: { ids: selectedIds } }),
    onSuccess: (result) => {
      toast.success(bn ? `${result.deleted}টি মুছে ফেলা হয়েছে।` : `${result.deleted} deleted.`);
      refreshRedirects();
    },
    onError: (error) => toast.error(errText(error)),
  });

  const importMutation = useMutation({
    mutationFn: (csv: string) => importCsv({ data: { csv } }),
    onSuccess: (result) => {
      const head = bn
        ? `${result.imported}টি ইমপোর্ট হয়েছে`
        : `${result.imported} rule(s) imported`;
      if (result.errors.length > 0) {
        toast.warning(`${head} — ${result.errors.length} ${bn ? "সারিতে সমস্যা" : "problem row(s)"}`);
      } else {
        toast.success(head);
      }
      refreshRedirects();
    },
    onError: (error) => toast.error(errText(error)),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportCsv(),
    onSuccess: ({ csv }) => {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "redirects.csv";
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(errText(error)),
  });

  /* -------------------------------- 404 log ------------------------------ */

  const [missingTarget, setMissingTarget] = useState<Record<string, string>>({});
  const resolveMutation = useMutation({
    mutationFn: (input: { id: string; toPath: string }) =>
      resolveMissing({ data: { id: input.id, toPath: input.toPath, status: 301 } }),
    onSuccess: () => {
      toast.success(bn ? "৪০৪ থেকে রিডাইরেক্ট তৈরি হয়েছে।" : "Redirect created from the 404 log.");
      refreshRedirects();
    },
    onError: (error) => toast.error(errText(error)),
  });
  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissMissing({ data: { id } }),
    onSuccess: refreshRedirects,
    onError: (error) => toast.error(errText(error)),
  });

  const redirects = redirectQuery.data?.rows ?? [];
  const total = redirectQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const missing = stateQuery.data?.missing ?? [];

  return (
    <div className="space-y-6">
      <ErrorFrame message={stateQuery.error ? errText(stateQuery.error) : null} />

      {/* -------------------------- permalink pattern ------------------- */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <header>
          <h3 className="text-sm font-semibold">{bn ? "পারমালিংক" : "Permalinks"}</h3>
          <p className="text-xs text-muted-foreground">
            {bn
              ? "URL গঠন বদলালে পুরোনো ঠিকানার জন্য স্বয়ংক্রিয়ভাবে ৩০১ রিডাইরেক্ট তৈরি হবে।"
              : "Changing the structure writes 301 redirects for every live URL before the new pattern goes live."}
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label={bn ? "ব্লগ বেস" : "Blog base"}>
            <input
              className={inputClass}
              value={settings.articleBase}
              placeholder="/blog"
              onChange={(e) => set("articleBase", e.target.value)}
            />
          </Field>
          <Field label={bn ? "পোস্ট প্যাটার্ন" : "Post pattern"}>
            <select
              className={inputClass}
              value={settings.articlePattern}
              onChange={(e) => set("articlePattern", e.target.value as PermalinkSettings["articlePattern"])}
            >
              {ARTICLE_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {(bn ? PATTERN_LABELS[pattern]?.bn : PATTERN_LABELS[pattern]?.en) ?? pattern} — {pattern}
                </option>
              ))}
            </select>
          </Field>
          <Field label={bn ? "পণ্য বেস" : "Product base"}>
            <input className={inputClass} value={settings.productBase} onChange={(e) => set("productBase", e.target.value)} />
          </Field>
          <Field label={bn ? "কালেকশন বেস" : "Collection base"}>
            <input className={inputClass} value={settings.collectionBase} onChange={(e) => set("collectionBase", e.target.value)} />
          </Field>
          <Field label={bn ? "পেজ বেস" : "Page base"}>
            <input className={inputClass} value={settings.pageBase} onChange={(e) => set("pageBase", e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            disabled={!dirty || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending
              ? bn ? "হিসাব হচ্ছে…" : "Calculating…"
              : bn ? "পরিবর্তন দেখুন" : "Preview change"}
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!plan || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending
              ? bn ? "প্রয়োগ হচ্ছে…" : "Applying…"
              : bn ? "প্রয়োগ করুন" : "Apply & write redirects"}
          </button>
          {dirty && !plan ? (
            <span className="self-center text-xs text-muted-foreground">
              {bn ? "প্রয়োগের আগে প্রিভিউ দরকার।" : "Preview is required before applying."}
            </span>
          ) : null}
        </div>

        {plan ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
            <p className="font-medium">
              {bn ? `${plan.total}টি URL সরবে` : `${plan.total} URL(s) will move`}
              {plan.droppedLoops > 0
                ? bn
                  ? ` · ${plan.droppedLoops}টি লুপ বাদ`
                  : ` · ${plan.droppedLoops} loop(s) dropped`
                : ""}
            </p>
            {plan.warnings.map((warning) => (
              <p key={warning.code} className="text-amber-600 dark:text-amber-400">
                {bn ? warning.bn : warning.en}
              </p>
            ))}
            <ul className="max-h-48 space-y-1 overflow-auto font-mono">
              {plan.sample.map((move) => (
                <li key={move.from}>
                  <span className="text-muted-foreground">{move.from}</span> → {move.to}
                </li>
              ))}
            </ul>
            {plan.total > plan.sample.length ? (
              <p className="text-muted-foreground">
                {bn
                  ? `আরও ${plan.total - plan.sample.length}টি…`
                  : `and ${plan.total - plan.sample.length} more…`}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---------------------------- redirects -------------------------- */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{bn ? "রিডাইরেক্ট" : "Redirects"}</h3>
            <p className="text-xs text-muted-foreground">
              {bn ? `${total}টি নিয়ম` : `${total} rule(s)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
              {bn ? "CSV ইমপোর্ট" : "Import CSV"}
            </button>
            <button type="button" className={btnGhost} onClick={() => exportMutation.mutate()}>
              {bn ? "CSV এক্সপোর্ট" : "Export CSV"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) importMutation.mutate(await file.text());
              }}
            />
          </div>
        </header>

        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
          <input
            className={inputClass}
            placeholder={bn ? "/পুরোনো-পথ" : "/old-path"}
            value={newFrom}
            onChange={(e) => setNewFrom(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder={bn ? "/নতুন-পথ" : "/new-path"}
            value={newTo}
            disabled={newStatus === 410}
            onChange={(e) => setNewTo(e.target.value)}
          />
          <select
            className={inputClass}
            value={newStatus}
            onChange={(e) => setNewStatus(Number(e.target.value) as 301 | 302 | 410)}
          >
            <option value={301}>301</option>
            <option value={302}>302</option>
            <option value={410}>410</option>
          </select>
          <button
            type="button"
            className={btnPrimary}
            disabled={!newFrom || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {bn ? "যোগ" : "Add"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className={inputClass}
            placeholder={bn ? "খুঁজুন" : "Search paths"}
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <button
            type="button"
            className={btnGhost}
            disabled={selectedIds.length === 0 || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {bn ? `মুছুন (${selectedIds.length})` : `Delete (${selectedIds.length})`}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-8 p-2" />
                <th className="p-2">{bn ? "থেকে" : "From"}</th>
                <th className="p-2">{bn ? "যেখানে" : "To"}</th>
                <th className="p-2">{bn ? "কোড" : "Code"}</th>
                <th className="p-2">{bn ? "উৎস" : "Origin"}</th>
                <th className="p-2">{bn ? "হিট" : "Hits"}</th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`select ${row.fromPath}`}
                      checked={selectedIds.includes(row.id)}
                      onChange={(e) =>
                        setSelectedIds((ids) =>
                          e.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td className="p-2 font-mono">{row.fromPath}</td>
                  <td className="p-2 font-mono">{row.status === 410 ? "—" : row.toPath}</td>
                  <td className="p-2">{row.status}</td>
                  <td className="p-2">{row.origin}</td>
                  <td className="p-2">{row.hits}</td>
                </tr>
              ))}
              {redirects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    {bn ? "কোনো রিডাইরেক্ট নেই।" : "No redirects yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="flex items-center gap-2 text-xs">
            <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </button>
            <span>
              {page} / {pages}
            </span>
            <button type="button" className={btnGhost} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              →
            </button>
          </div>
        ) : null}
      </section>

      {/* ----------------------------- 404 log --------------------------- */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <header>
          <h3 className="text-sm font-semibold">{bn ? "৪০৪ লগ" : "404 log"}</h3>
          <p className="text-xs text-muted-foreground">
            {bn
              ? "যেসব ঠিকানায় ভিজিটর এসে কিছু পাননি — এক ক্লিকে রিডাইরেক্ট বানান।"
              : "Paths visitors hit that returned nothing. Promote the ones worth keeping."}
          </p>
        </header>
        <ul className="space-y-2">
          {missing.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
              <span className="font-mono">{row.path}</span>
              <span className="text-muted-foreground">
                {row.hits} {bn ? "হিট" : "hits"}
              </span>
              <input
                className={`${inputClass} max-w-xs`}
                placeholder={bn ? "গন্তব্য পথ" : "Destination path"}
                value={missingTarget[row.id] ?? ""}
                onChange={(e) => setMissingTarget((map) => ({ ...map, [row.id]: e.target.value }))}
              />
              <button
                type="button"
                className={btnPrimary}
                disabled={!missingTarget[row.id] || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: row.id, toPath: missingTarget[row.id] ?? "" })}
              >
                {bn ? "রিডাইরেক্ট" : "Redirect"}
              </button>
              <button type="button" className={btnGhost} onClick={() => dismissMutation.mutate(row.id)}>
                {bn ? "বাতিল" : "Dismiss"}
              </button>
            </li>
          ))}
          {missing.length === 0 ? (
            <li className="text-xs text-muted-foreground">{bn ? "কোনো ৪০৪ নেই।" : "No unresolved 404s."}</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
