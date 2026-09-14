/**
 * Phase 5 — Site Kit desk.
 *
 * Four jobs, in the order a merchant does them:
 *  1. connect a verified Search Console property (listing costs Google quota,
 *     so it is behind an explicit button, never fetched on mount)
 *  2. paste search-engine verification tokens
 *  3. switch analytics vendors on, with the byte cost of each stated *before*
 *     it is enabled, plus a warning once the third-party budget is exceeded
 *  4. read performance and job history — snapshot rows only, never a live call
 *
 * Every failure the backend classified is shown as a plain-language banner with
 * the one action that actually helps (reconnect / retry / fix), never a raw
 * provider error.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";
import {
  siteKitArticlesFn,
  siteKitInspectFn,
  siteKitPropertiesFn,
  siteKitRefreshFn,
  siteKitSaveFn,
  siteKitSnapshotFn,
  siteKitStateFn,
} from "@/lib/search-console.functions";
import {
  ANALYTICS_BUDGET_WARN_KB,
  ANALYTICS_SPEC,
  ANALYTICS_VENDORS,
  CUSTOM_VERIFICATION_MAX,
  VERIFICATION_PROVIDERS,
  VERIFICATION_SPEC,
  analyticsBudgetKb,
  type AnalyticsVendor,
  type CustomVerification,
  type SiteKitSettings,
  type VerificationProvider,
} from "@/lib/search-console";

const WINDOWS = [7, 28, 90] as const;

function errText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function SiteKitDesk() {
  const { lang, t } = useLang();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const loadState = useServerFn(siteKitStateFn);
  const loadSnapshot = useServerFn(siteKitSnapshotFn);
  const loadArticles = useServerFn(siteKitArticlesFn);
  const listProperties = useServerFn(siteKitPropertiesFn);
  const save = useServerFn(siteKitSaveFn);
  const refresh = useServerFn(siteKitRefreshFn);
  const inspect = useServerFn(siteKitInspectFn);

  const [days, setDays] = useState<number>(28);
  const [draft, setDraft] = useState<SiteKitSettings | null>(null);
  const [inspectUrlValue, setInspectUrlValue] = useState("");

  const stateQuery = useQuery({
    queryKey: ["sitekit", "state"],
    queryFn: async () => {
      const result = await loadState({ data: {} });
      setDraft((current) => current ?? result.settings);
      return result;
    },
  });

  const snapshotQuery = useQuery({
    queryKey: ["sitekit", "snapshot", days],
    queryFn: () => loadSnapshot({ data: { days } }),
    enabled: Boolean(stateQuery.data?.settings.searchConsoleSiteUrl),
  });

  const articlesQuery = useQuery({
    queryKey: ["sitekit", "articles", days],
    queryFn: () => loadArticles({ data: { days } }),
    enabled: Boolean(stateQuery.data?.settings.searchConsoleSiteUrl),
  });

  const propertiesMutation = useMutation({
    mutationFn: (force: boolean) => listProperties({ data: { origin, refresh: force } }),
    onError: (error) => toast.error(errText(error)),
  });

  const saveMutation = useMutation({
    mutationFn: (settings: SiteKitSettings) => save({ data: { settings } }),
    onSuccess: (result) => {
      setDraft(result.settings);
      for (const issue of result.issues) toast.warning(`${issue.field}: ${issue.message}`);
      if (result.issues.length === 0) toast.success(t("Site Kit saved.", "সাইট কিট সংরক্ষিত হয়েছে।"));
      void qc.invalidateQueries({ queryKey: ["sitekit"] });
    },
    onError: (error) => toast.error(errText(error)),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refresh({ data: { days } }),
    onSuccess: (result) => {
      toast.success(
        t(
          `Pulled ${result.rowsWritten} rows across ${result.daysCovered} days.`,
          `${result.daysCovered} দিনের ${result.rowsWritten} সারি আনা হয়েছে।`,
        ),
      );
      void qc.invalidateQueries({ queryKey: ["sitekit"] });
    },
    onError: (error) => toast.error(errText(error)),
  });

  const inspectMutation = useMutation({
    mutationFn: (url: string) => inspect({ data: { url } }),
    onError: (error) => toast.error(errText(error)),
  });

  const state = stateQuery.data;
  const budgetKb = useMemo(() => (draft ? analyticsBudgetKb(draft.analytics) : 0), [draft]);
  const overBudget = budgetKb > ANALYTICS_BUDGET_WARN_KB;

  if (stateQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {t("Loading Site Kit…", "সাইট কিট লোড হচ্ছে…")}
      </div>
    );
  }
  if (stateQuery.error) return <ErrorFrame message={errText(stateQuery.error)} />;
  if (!state || !draft) return null;

  const patch = (next: Partial<SiteKitSettings>) => setDraft({ ...draft, ...next });
  const setToken = (provider: VerificationProvider, value: string) =>
    patch({
      verification: {
        ...draft.verification,
        tokens: { ...draft.verification.tokens, [provider]: value },
      },
    });
  const setCustom = (custom: CustomVerification[]) =>
    patch({ verification: { ...draft.verification, custom } });
  const setVendor = (vendor: AnalyticsVendor, value: string) =>
    patch({ analytics: { ...draft.analytics, enabled: { ...draft.analytics.enabled, [vendor]: value } } });

  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby="sitekit-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="sitekit-heading" className="font-medium">
            {t("Site Kit — Search Console & analytics", "সাইট কিট — সার্চ কনসোল ও অ্যানালিটিক্স")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Verification tags, the connected Search Console property, and the tags your storefront loads.",
              "ভেরিফিকেশন ট্যাগ, সংযুক্ত সার্চ কনসোল প্রোপার্টি এবং স্টোরফ্রন্টে লোড হওয়া ট্যাগ।",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            tone={state.connection?.status === "connected" ? "success" : "warning"}
            label={
              state.connection?.status === "connected"
                ? t("Connected", "সংযুক্ত")
                : t("Not connected", "সংযুক্ত নয়")
            }
          />
          <button
            type="button"
            className={btnGhost}
            disabled={refreshMutation.isPending || !draft.searchConsoleSiteUrl}
            onClick={() => refreshMutation.mutate()}
          >
            {refreshMutation.isPending ? t("Refreshing…", "রিফ্রেশ হচ্ছে…") : t("Refresh now", "এখনই রিফ্রেশ")}
          </button>
        </div>
      </header>

      {!state.configured && (
        <p className="rounded-fq-md bg-warning-soft p-3 text-sm text-warning-foreground">
          {t(
            "Google Search Console is not connected for this platform yet, so refreshes will not run. Verification tags and analytics still work.",
            "এই প্ল্যাটফর্মে গুগল সার্চ কনসোল এখনো সংযুক্ত নয়, তাই রিফ্রেশ চলবে না। ভেরিফিকেশন ট্যাগ ও অ্যানালিটিক্স কাজ করবে।",
          )}
        </p>
      )}

      {/* Reconnect banner — derived from the stored failure code, never from a live call. */}
      {state.banner && (
        <div
          role="alert"
          className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p>{bn ? state.banner.bn : state.banner.en}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.banner.action === "reconnect"
              ? t(
                  "Ask the platform owner to reconnect the Google account in connector settings.",
                  "কানেক্টর সেটিংসে গুগল অ্যাকাউন্ট আবার সংযুক্ত করতে প্ল্যাটফর্ম মালিককে বলুন।",
                )
              : state.banner.action === "fix"
                ? t("Choose a property again below.", "নিচে আবার একটি প্রোপার্টি বেছে নিন।")
                : t("The next scheduled run will retry automatically.", "পরের নির্ধারিত রানে স্বয়ংক্রিয়ভাবে আবার চেষ্টা হবে।")}
            {state.connection?.consecutive_failures
              ? ` · ${state.connection.consecutive_failures} ${t("consecutive failures", "টানা ব্যর্থতা")}`
              : ""}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------- property */}
      <div className="rounded-fq-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{t("Search Console property", "সার্চ কনসোল প্রোপার্টি")}</h4>
          <button
            type="button"
            className={btnGhost}
            disabled={propertiesMutation.isPending}
            onClick={() => propertiesMutation.mutate(true)}
          >
            {propertiesMutation.isPending
              ? t("Checking…", "দেখা হচ্ছে…")
              : t("List verified properties", "ভেরিফায়েড প্রোপার্টি দেখুন")}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {draft.searchConsoleSiteUrl
            ? `${t("Selected", "নির্বাচিত")}: ${draft.searchConsoleSiteUrl}`
            : t("No property selected — search performance stays empty.", "কোনো প্রোপার্টি নির্বাচিত নয় — সার্চ পারফরম্যান্স ফাঁকা থাকবে।")}
        </p>

        {propertiesMutation.data && (
          <div className="mt-3 space-y-2">
            {propertiesMutation.data.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "The connected Google account owns no verified property for this domain.",
                  "সংযুক্ত গুগল অ্যাকাউন্টে এই ডোমেইনের কোনো ভেরিফায়েড প্রোপার্টি নেই।",
                )}
              </p>
            ) : (
              <ul className="space-y-1">
                {propertiesMutation.data.properties.map((property) => (
                  <li key={property.siteUrl} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">
                      {property.siteUrl}
                      <span className="ml-2 text-xs text-muted-foreground">{property.permissionLevel}</span>
                    </span>
                    <button
                      type="button"
                      className={btnGhost}
                      aria-pressed={draft.searchConsoleSiteUrl === property.siteUrl}
                      onClick={() => patch({ searchConsoleSiteUrl: property.siteUrl })}
                    >
                      {draft.searchConsoleSiteUrl === property.siteUrl
                        ? t("Selected", "নির্বাচিত")
                        : t("Use this", "এটি ব্যবহার করুন")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {propertiesMutation.data.resolution.status === "selection_required" && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "More than one property covers this store — pick the one you want reports from.",
                  "একাধিক প্রোপার্টি এই দোকান কভার করে — যেটির রিপোর্ট চান সেটি বেছে নিন।",
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ verification */}
      <div className="rounded-fq-md border border-border p-3">
        <h4 className="text-sm font-medium">{t("Ownership verification", "মালিকানা ভেরিফিকেশন")}</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {VERIFICATION_PROVIDERS.map((provider) => (
            <Field key={provider} label={VERIFICATION_SPEC[provider].label} hint={VERIFICATION_SPEC[provider].help}>
              <input
                className={inputClass}
                value={draft.verification.tokens[provider] ?? ""}
                onChange={(e) => setToken(provider, e.target.value)}
                placeholder={VERIFICATION_SPEC[provider].metaName}
              />
            </Field>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {draft.verification.custom.map((tag, i) => (
            <div key={`${tag.name}-${i}`} className="flex flex-wrap items-end gap-2">
              <input
                className={inputClass}
                aria-label={t("Meta name", "মেটা নাম")}
                value={tag.name}
                onChange={(e) =>
                  setCustom(draft.verification.custom.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))
                }
              />
              <input
                className={inputClass}
                aria-label={t("Meta content", "মেটা কনটেন্ট")}
                value={tag.content}
                onChange={(e) =>
                  setCustom(draft.verification.custom.map((c, j) => (j === i ? { ...c, content: e.target.value } : c)))
                }
              />
              <button
                type="button"
                className={btnGhost}
                onClick={() => setCustom(draft.verification.custom.filter((_, j) => j !== i))}
              >
                {t("Remove", "মুছুন")}
              </button>
            </div>
          ))}
          {draft.verification.custom.length < CUSTOM_VERIFICATION_MAX && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => setCustom([...draft.verification.custom, { name: "", content: "" }])}
            >
              {t("Add another meta tag", "আরেকটি মেটা ট্যাগ যোগ করুন")}
            </button>
          )}
        </div>
      </div>

      {/* --------------------------------------------------- analytics */}
      <div className="rounded-fq-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{t("Analytics tags", "অ্যানালিটিক্স ট্যাগ")}</h4>
          <p className={`text-xs tabular-nums ${overBudget ? "text-destructive" : "text-muted-foreground"}`}>
            {t("Third-party weight", "তৃতীয় পক্ষের ওজন")}: {budgetKb} kB / {ANALYTICS_BUDGET_WARN_KB} kB
            {overBudget ? ` — ${t("over budget", "বাজেটের বেশি")}` : ""}
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ANALYTICS_VENDORS.map((vendor) => (
            <Field
              key={vendor}
              label={`${ANALYTICS_SPEC[vendor].label} — ${ANALYTICS_SPEC[vendor].transferKb} kB`}
              hint={t(
                `Adds about ${ANALYTICS_SPEC[vendor].transferKb} kB to every storefront page.`,
                `প্রতিটি স্টোরফ্রন্ট পেজে প্রায় ${ANALYTICS_SPEC[vendor].transferKb} kB যোগ করবে।`,
              )}
            >
              <input
                className={inputClass}
                value={draft.analytics.enabled[vendor] ?? ""}
                onChange={(e) => setVendor(vendor, e.target.value)}
                placeholder={ANALYTICS_SPEC[vendor].placeholder}
              />
            </Field>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.analytics.consentRequired}
            onChange={(e) => patch({ analytics: { ...draft.analytics, consentRequired: e.target.checked } })}
          />
          {t("Load tags only after visitor consent", "ভিজিটরের সম্মতির পরেই ট্যাগ লোড করুন")}
        </label>
        {state.plan.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Currently live", "এখন চালু")}: {state.plan.map((tag) => tag.vendor).join(", ")} ·{" "}
            {state.budgetKb} kB
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(draft)}
        >
          {saveMutation.isPending ? t("Saving…", "সংরক্ষণ হচ্ছে…") : t("Save Site Kit", "সাইট কিট সংরক্ষণ")}
        </button>
        <button type="button" className={btnGhost} onClick={() => setDraft(state.settings)}>
          {t("Discard changes", "পরিবর্তন বাতিল")}
        </button>
      </div>

      {/* ------------------------------------------------- performance */}
      <div className="rounded-fq-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{t("Search performance", "সার্চ পারফরম্যান্স")}</h4>
          <div className="flex gap-2">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={btnGhost}
                aria-pressed={days === w}
                onClick={() => setDays(w)}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        {!draft.searchConsoleSiteUrl ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Select a property to see search data.", "সার্চ ডেটা দেখতে একটি প্রোপার্টি নির্বাচন করুন।")}
          </p>
        ) : snapshotQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>
        ) : snapshotQuery.error ? (
          <ErrorFrame message={errText(snapshotQuery.error)} />
        ) : snapshotQuery.data ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshotQuery.data.window.start} → {snapshotQuery.data.window.end} ·{" "}
              {t(
                `Google reports with about ${snapshotQuery.data.window.lagDays} days of lag.`,
                `গুগলের ডেটা প্রায় ${snapshotQuery.data.window.lagDays} দিন পিছিয়ে থাকে।`,
              )}
              {snapshotQuery.data.freshness.stale
                ? ` · ${t("snapshot is stale", "স্ন্যাপশট পুরোনো")}`
                : ""}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={t("Clicks", "ক্লিক")} value={String(snapshotQuery.data.totals.clicks)} />
              <Metric label={t("Impressions", "ইম্প্রেশন")} value={String(snapshotQuery.data.totals.impressions)} />
              <Metric label="CTR" value={pct(snapshotQuery.data.totals.ctr)} />
              <Metric
                label={t("Avg. position", "গড় অবস্থান")}
                value={snapshotQuery.data.totals.position.toFixed(1)}
              />
            </dl>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <RowTable
                title={t("Top queries", "সেরা কোয়েরি")}
                rows={snapshotQuery.data.topQueries.slice(0, 10)}
              />
              <RowTable title={t("Top pages", "সেরা পেজ")} rows={snapshotQuery.data.topPages.slice(0, 10)} />
            </div>
          </>
        ) : null}

        {articlesQuery.data && articlesQuery.data.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Articles", "আর্টিকেল")}
            </h5>
            <ul className="mt-2 space-y-1 text-sm">
              {articlesQuery.data.slice(0, 10).map((article) => (
                <li key={article.articleId} className="flex justify-between gap-3 tabular-nums">
                  <span className="truncate">{article.title}</span>
                  <span className="text-muted-foreground">
                    {article.clicks} · {article.impressions} · {article.position.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- inspect */}
      <div className="rounded-fq-md border border-border p-3">
        <h4 className="text-sm font-medium">{t("Check a URL in Google's index", "গুগল ইনডেক্সে একটি URL দেখুন")}</h4>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            className={inputClass}
            aria-label={t("URL to inspect", "পরীক্ষার URL")}
            value={inspectUrlValue}
            onChange={(e) => setInspectUrlValue(e.target.value)}
            placeholder={`${origin}/store/…`}
          />
          <button
            type="button"
            className={btnGhost}
            disabled={inspectMutation.isPending || inspectUrlValue.trim().length === 0}
            onClick={() => inspectMutation.mutate(inspectUrlValue.trim())}
          >
            {inspectMutation.isPending ? t("Checking…", "দেখা হচ্ছে…") : t("Check", "দেখুন")}
          </button>
        </div>
        {inspectMutation.data && (
          <dl className="mt-3 space-y-1 text-sm">
            <Line label={t("Verdict", "ফলাফল")} value={inspectMutation.data.verdict} />
            <Line label={t("Coverage", "কভারেজ")} value={inspectMutation.data.coverageState} />
            <Line label={t("Last crawled", "শেষ ক্রল")} value={inspectMutation.data.lastCrawled ?? "—"} />
            <Line
              label={t("Google's canonical", "গুগলের ক্যানোনিকাল")}
              value={inspectMutation.data.canonicalGoogle ?? "—"}
            />
            <p className="pt-1 text-xs text-muted-foreground">{inspectMutation.data.disclaimer}</p>
          </dl>
        )}
      </div>

      {/* ------------------------------------------------- job history */}
      <div className="rounded-fq-md border border-border p-3">
        <h4 className="text-sm font-medium">{t("Sync history", "সিঙ্ক ইতিহাস")}</h4>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {state.jobs.length === 0 && <li>{t("No syncs yet.", "এখনো কোনো সিঙ্ক হয়নি।")}</li>}
          {state.jobs.map((job) => (
            <li key={job.id} className="tabular-nums">
              {new Date(job.started_at).toLocaleString()} — {job.kind} · {job.status} · {job.trigger} ·{" "}
              {job.rows_written} {t("rows", "সারি")}
              {job.error_code ? ` · ${job.error_code}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-fq-md bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function RowTable({
  title,
  rows,
}: {
  title: string;
  rows: { value: string; clicks: number; impressions: number; ctr: number; position: number; positionChange: number | null }[];
}) {
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h5>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.value} className="flex justify-between gap-3 tabular-nums">
              <span className="truncate">{row.value}</span>
              <span className="text-muted-foreground">
                {row.clicks} · {pct(row.ctr)} · {row.position.toFixed(1)}
                {row.positionChange !== null && row.positionChange !== 0
                  ? ` (${row.positionChange > 0 ? "+" : ""}${row.positionChange.toFixed(1)})`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}