/**
 * Phase 4 — Sitemap & robots.txt desk.
 *
 * The whole panel is a two-step editor: change settings, see the *rendered*
 * artefact diffed against what crawlers get today, then save. Preview and
 * production share `renderRobotsTxt` on the server, so what is diffed here is
 * exactly what ships — no second renderer to drift.
 *
 * Client-side rules:
 *  - never save without the merchant having seen a diff
 *  - the safety directives are rendered read-only, so it is visible that they
 *    cannot be removed rather than merely documented
 *  - path testing runs against the rendered file, not against the form state
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import {
  crawlPreviewFn,
  crawlSaveFn,
  crawlStateFn,
  crawlTestPathFn,
} from "@/lib/sitemap-config.functions";
import {
  CHANGEFREQS,
  DEFAULT_CRAWL_SETTINGS,
  ENTRIES_PER_FILE_MAX,
  ENTRIES_PER_FILE_MIN,
  SAFETY_DISALLOW,
  SITEMAP_KINDS,
  diffLines,
  diffSummary,
  type CrawlSettings,
  type SitemapKind,
} from "@/lib/sitemap-config";

const KIND_LABELS: Record<SitemapKind, { en: string; bn: string }> = {
  pages: { en: "Pages", bn: "পেজ" },
  products: { en: "Products", bn: "প্রোডাক্ট" },
  collections: { en: "Collections", bn: "কালেকশন" },
  articles: { en: "Articles", bn: "আর্টিকেল" },
};

function errText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function CrawlDesk() {
  const { lang } = useLang();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const loadState = useServerFn(crawlStateFn);
  const previewFn = useServerFn(crawlPreviewFn);
  const saveFn = useServerFn(crawlSaveFn);
  const testFn = useServerFn(crawlTestPathFn);

  const state = useQuery({
    queryKey: ["crawl-state", origin],
    queryFn: () => loadState({ data: { origin } }),
    enabled: Boolean(origin),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<CrawlSettings>(DEFAULT_CRAWL_SETTINGS);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof crawlPreviewFn>> | null>(null);
  const [testPath, setTestPath] = useState("/store/");
  const [testAgent, setTestAgent] = useState("*");
  const [verdict, setVerdict] = useState<{ allowed: boolean; rule: string | null; path: string } | null>(
    null,
  );

  useEffect(() => {
    if (state.data?.settings) setDraft(state.data.settings as CrawlSettings);
  }, [state.data?.settings]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.data?.settings ?? DEFAULT_CRAWL_SETTINGS),
    [draft, state.data?.settings],
  );

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: { origin, candidate: draft } }),
    onSuccess: (result) => setPreview(result),
    onError: (error) => toast.error(errText(error)),
  });

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { origin, settings: draft } }),
    onSuccess: (result) => {
      setPreview(result);
      qc.invalidateQueries({ queryKey: ["crawl-state"] });
      toast.success(bn ? "ক্রল সেটিংস সংরক্ষিত হয়েছে" : "Crawl settings saved");
    },
    onError: (error) => toast.error(errText(error)),
  });

  const testMutation = useMutation({
    mutationFn: () => testFn({ data: { origin, path: testPath, agent: testAgent || "*" } }),
    onSuccess: (result) => setVerdict(result),
    onError: (error) => toast.error(errText(error)),
  });

  const patchSitemap = useCallback((patch: Partial<CrawlSettings["sitemap"]>) => {
    setDraft((current) => ({ ...current, sitemap: { ...current.sitemap, ...patch } }));
  }, []);
  const patchRobots = useCallback((patch: Partial<CrawlSettings["robots"]>) => {
    setDraft((current) => ({ ...current, robots: { ...current.robots, ...patch } }));
  }, []);
  const patchKind = useCallback(
    (kind: SitemapKind, patch: Partial<CrawlSettings["sitemap"]["kinds"][SitemapKind]>) => {
      setDraft((current) => ({
        ...current,
        sitemap: {
          ...current.sitemap,
          kinds: { ...current.sitemap.kinds, [kind]: { ...current.sitemap.kinds[kind], ...patch } },
        },
      }));
    },
    [],
  );

  const robotsDiff = useMemo(() => {
    if (!preview) return null;
    const lines = diffLines(preview.currentRobots, preview.nextRobots);
    return { lines, summary: diffSummary(lines) };
  }, [preview]);

  if (state.isError) {
    return <ErrorFrame message={errText(state.error)} />;
  }


  const counts = (preview?.counts ?? state.data?.counts ?? {}) as Partial<Record<SitemapKind, number>>;
  const shards = preview?.shards ?? state.data?.shards ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{bn ? "সাইটম্যাপ ও robots.txt" : "Sitemap & robots.txt"}</h2>
        <p className="text-sm text-muted-foreground">
          {bn
            ? "কোন কনটেন্ট ক্রলাররা দেখবে তা এখান থেকেই নিয়ন্ত্রণ করুন — সেভের আগে রেন্ডার করা ফাইল দেখে নিন।"
            : "Decide what crawlers see. Every change is previewed as the rendered file before it ships."}
        </p>
      </header>

      {/* ------------------------------ sitemap ------------------------------ */}
      <div className="rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{bn ? "সাইটম্যাপ" : "Sitemap"}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">{bn ? "ধরন" : "Type"}</th>
                <th>{bn ? "অন্তর্ভুক্ত" : "Include"}</th>
                <th>changefreq</th>
                <th>priority</th>
                <th className="text-right">{bn ? "এন্ট্রি" : "Entries"}</th>
              </tr>
            </thead>
            <tbody>
              {SITEMAP_KINDS.map((kind) => {
                const cfg = draft.sitemap.kinds[kind];
                return (
                  <tr key={kind} className="border-t border-border">
                    <td className="py-2 font-medium">{bn ? KIND_LABELS[kind].bn : KIND_LABELS[kind].en}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`include ${kind}`}
                        checked={cfg.include}
                        onChange={(event) => patchKind(kind, { include: event.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        className={inputClass}
                        aria-label={`${kind} changefreq`}
                        value={cfg.changefreq}
                        onChange={(event) =>
                          patchKind(kind, { changefreq: event.target.value as (typeof CHANGEFREQS)[number] })
                        }
                      >
                        {CHANGEFREQS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className={inputClass}
                        aria-label={`${kind} priority`}
                        value={cfg.priority}
                        onChange={(event) => patchKind(kind, { priority: event.target.value })}
                      />
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {counts[kind] ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={bn ? "প্রতি ফাইলে এন্ট্রি" : "Entries per file"}>
            <input
              type="number"
              className={inputClass}
              min={ENTRIES_PER_FILE_MIN}
              max={ENTRIES_PER_FILE_MAX}
              value={draft.sitemap.entriesPerFile}
              onChange={(event) => patchSitemap({ entriesPerFile: Number(event.target.value) })}
            />
          </Field>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.sitemap.includeImages}
              onChange={(event) => patchSitemap({ includeImages: event.target.checked })}
            />
            {bn ? "ছবি সাইটম্যাপে যোগ করুন" : "Include images in sitemap"}
          </label>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {bn ? "বর্তমান শার্ড" : "Current shards"}: {shards.length}
          {shards.length > 0 && ` — ${shards.map((s) => `${s.kind}-${s.page} (${s.count})`).join(", ")}`}
        </p>
      </div>

      {/* ------------------------------ robots ------------------------------- */}
      <div className="rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">robots.txt</h3>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.robots.indexable}
              onChange={(event) => patchRobots({ indexable: event.target.checked })}
            />
            {bn ? "সার্চ ইঞ্জিন ইনডেক্স করতে পারবে" : "Allow search engines to index this store"}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.robots.aiCrawlers}
              disabled={!draft.robots.indexable}
              onChange={(event) => patchRobots({ aiCrawlers: event.target.checked })}
            />
            {bn ? "AI উত্তর-ইঞ্জিনকে অনুমতি দিন" : "Allow AI answer crawlers (GPTBot, ClaudeBot, …)"}
          </label>
        </div>

        <Field label={bn ? "অতিরিক্ত সাইটম্যাপ URL (প্রতি লাইনে একটি)" : "Extra sitemap URLs (one per line)"}>
          <textarea
            className={`${inputClass} min-h-20 font-mono text-xs`}
            value={draft.robots.extraSitemaps.join("\n")}
            onChange={(event) =>
              patchRobots({
                extraSitemaps: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>

        <Field label={bn ? "কাস্টম robots নিয়ম" : "Custom robots directives"}>
          <textarea
            className={`${inputClass} min-h-28 font-mono text-xs`}
            placeholder={"User-agent: SemrushBot\nDisallow: /"}
            value={draft.robots.rawAppend}
            onChange={(event) => patchRobots({ rawAppend: event.target.value })}
          />
        </Field>

        <p className="mt-2 text-xs text-muted-foreground">
          {bn ? "সবসময় ব্লক থাকবে" : "Always blocked, cannot be removed"}:{" "}
          <code>{SAFETY_DISALLOW.join(" · ")}</code>
        </p>
      </div>

      {/* ------------------------------ actions ------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnGhost}
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
        >
          {previewMutation.isPending
            ? bn
              ? "প্রিভিউ হচ্ছে…"
              : "Previewing…"
            : bn
              ? "প্রিভিউ ও ডিফ"
              : "Preview & diff"}
        </button>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || !preview || saveMutation.isPending}
          title={!preview ? (bn ? "আগে প্রিভিউ দেখুন" : "Preview before saving") : undefined}
        >
          {saveMutation.isPending ? (bn ? "সেভ হচ্ছে…" : "Saving…") : bn ? "সেভ করুন" : "Save"}
        </button>
        {dirty && (
          <span className="text-xs text-muted-foreground">
            {bn ? "অসংরক্ষিত পরিবর্তন আছে" : "Unsaved changes"}
          </span>
        )}
      </div>

      {robotsDiff && (
        <div className="rounded-fq-md border border-border p-4">
          <h3 className="text-sm font-semibold">
            {bn ? "robots.txt পরিবর্তন" : "robots.txt changes"}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              +{robotsDiff.summary.added} / −{robotsDiff.summary.removed}
            </span>
          </h3>
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-5">
            {robotsDiff.lines.map((line, index) => (
              <div
                key={`${index}-${line.text}`}
                className={
                  line.kind === "added"
                    ? "text-emerald-600"
                    : line.kind === "removed"
                      ? "text-destructive line-through"
                      : "text-muted-foreground"
                }
              >
                {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      )}

      {preview?.sitemapIndex && (
        <div className="rounded-fq-md border border-border p-4">
          <h3 className="text-sm font-semibold">{bn ? "সাইটম্যাপ ইনডেক্স" : "Sitemap index"}</h3>
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-5">
            {preview.sitemapIndex}
          </pre>
        </div>
      )}

      {/* ---------------------------- path tester ---------------------------- */}
      <div className="rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{bn ? "পাথ পরীক্ষা করুন" : "Test a path"}</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={bn ? "পাথ" : "Path"}>
            <input
              className={inputClass}
              value={testPath}
              onChange={(event) => setTestPath(event.target.value)}
            />
          </Field>
          <Field label={bn ? "ক্রলার" : "Crawler"}>
            <input
              className={inputClass}
              value={testAgent}
              onChange={(event) => setTestAgent(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className={btnGhost}
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {bn ? "পরীক্ষা" : "Test"}
          </button>
        </div>
        {verdict && (
          <p className="mt-3 text-sm">
            <code>{verdict.path}</code>{" "}
            <strong className={verdict.allowed ? "text-emerald-600" : "text-destructive"}>
              {verdict.allowed ? (bn ? "অনুমোদিত" : "Allowed") : bn ? "ব্লকড" : "Blocked"}
            </strong>
            {verdict.rule && <span className="text-muted-foreground"> — {verdict.rule}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
