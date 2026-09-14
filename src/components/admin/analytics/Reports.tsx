import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Download, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  analyticsDeleteReportFn,
  analyticsFlushFn,
  analyticsPipelineFn,
  analyticsReportsFn,
  analyticsRunReportFn,
  analyticsSaveReportFn,
} from "@/lib/analytics.functions";
import {
  FLUSH_WINDOW_SECONDS,
  RAW_WINDOW_DAYS,
  REPORT_DATASETS,
  validateReport,
  type DatasetKey,
} from "@/lib/analytics-pipeline";
import { useLang } from "@/lib/i18n";


type Draft = {
  id: string | null;
  name: string;
  dataset: DatasetKey;
  dimensions: string[];
  metrics: string[];
  rangeDays: number;
  schedule: "off" | "daily" | "weekly" | "monthly";
  format: "csv" | "json";
  recipients: string;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  dataset: "orders",
  dimensions: ["day"],
  metrics: ["orders", "revenue_minor_int"],
  rangeDays: 30,
  schedule: "off",
  format: "csv",
  recipients: "",
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function Reports() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[]; csv: string } | null>(null);

  const fetchReports = useServerFn(analyticsReportsFn);
  const fetchPipeline = useServerFn(analyticsPipelineFn);
  const saveReport = useServerFn(analyticsSaveReportFn);
  const deleteReport = useServerFn(analyticsDeleteReportFn);
  const runReport = useServerFn(analyticsRunReportFn);
  const flush = useServerFn(analyticsFlushFn);

  const reportsQuery = useQuery({ queryKey: ["analytics-reports"], queryFn: () => fetchReports({}) });
  const pipelineQuery = useQuery({ queryKey: ["analytics-pipeline"], queryFn: () => fetchPipeline({}) });

  const recipients = draft.recipients
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const verdict = useMemo(
    () => validateReport({ ...draft, recipients }),
    [draft, recipients.join(",")],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["analytics-reports"] });
    void qc.invalidateQueries({ queryKey: ["analytics-pipeline"] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveReport({
        data: {
          id: draft.id,
          name: draft.name,
          dataset: draft.dataset,
          dimensions: draft.dimensions,
          metrics: draft.metrics,
          rangeDays: draft.rangeDays,
          schedule: draft.schedule,
          format: draft.format,
          recipients,
        },
      }),
    onSuccess: () => {
      setDraft(EMPTY);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (reportId: string) => deleteReport({ data: { reportId } }),
    onSuccess: invalidate,
  });

  const run = useMutation({
    mutationFn: (reportId: string) => runReport({ data: { reportId } }),
    onSuccess: (result) => {
      setPreview({ columns: result.columns, rows: result.preview, csv: result.csv });
      invalidate();
    },
  });

  const flushNow = useMutation({ mutationFn: () => flush({}), onSuccess: invalidate });

  const download = () => {
    if (!preview) return;
    const blob = new Blob([preview.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `framique-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dataset = REPORT_DATASETS[draft.dataset];
  const health = pipelineQuery.data?.health;
  const mutationError = (save.error ?? run.error ?? remove.error ?? flushNow.error) as Error | null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight">
            {t("Reports & pipeline", "রিপোর্ট ও পাইপলাইন")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              `Custom reports from server rollups. Raw events keep for ${RAW_WINDOW_DAYS} days and fold every ${FLUSH_WINDOW_SECONDS / 60} minutes.`,
              `সার্ভার রোলআপ থেকে রিপোর্ট। কাঁচা ইভেন্ট ${RAW_WINDOW_DAYS} দিন থাকে।`,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/analytics/insights" className="min-h-9 rounded-fq-md border border-border px-3 py-2 text-sm hover:bg-muted">
            {t("Insights", "ইনসাইটস")}
          </Link>
          <button
            type="button"
            onClick={() => flushNow.mutate()}
            disabled={flushNow.isPending}
            className="inline-flex min-h-9 items-center gap-2 rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${flushNow.isPending ? "animate-spin" : ""}`} aria-hidden />
            {t("Run ETL now", "ETL চালান")}
          </button>
        </div>
      </header>

      {mutationError && (
        <p role="alert" className="mb-4 rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {mutationError.message}
        </p>
      )}

      <section aria-label="Pipeline health" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-bangla-display text-sm font-semibold">{t("Event pipeline", "ইভেন্ট পাইপলাইন")}</h2>
          {health && (
            <span
              className={`ml-auto rounded-fq-md px-2 py-0.5 text-xs font-medium ${
                health.healthy && !health.stale
                  ? "bg-success-soft text-success-foreground"
                  : "bg-warning-soft text-warning-foreground"
              }`}
            >
              {health.healthy && !health.stale
                ? t("Healthy", "সুস্থ")
                : health.stale
                  ? t("Stale — showing last good rollup", "পুরোনো ডেটা")
                  : t("Gap detected", "গ্যাপ")}
            </span>
          )}
        </div>

        {health && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("Raw rows", "কাঁচা রো")}</dt>
              <dd className="tabular-nums">{health.rawRows.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Events folded", "ফোল্ড হওয়া ইভেন্ট")}</dt>
              <dd className="tabular-nums">{health.totalEvents.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Last commit", "শেষ কমিট")}</dt>
              <dd className="tabular-nums">
                {health.lastCommittedAt ? new Date(health.lastCommittedAt).toLocaleString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Ledger problems", "লেজার সমস্যা")}</dt>
              <dd className="tabular-nums">{health.problems.length}</dd>
            </div>
          </dl>
        )}

        {pipelineQuery.data && pipelineQuery.data.conversions.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Ad conversions (server-side)", "অ্যাড কনভার্সন")}
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {pipelineQuery.data.conversions.slice(0, 6).map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {row.provider} · {row.event_name}
                  </span>
                  <span
                    className={`shrink-0 text-xs ${
                      row.status === "sent"
                        ? "text-success-foreground"
                        : row.status === "failed"
                          ? "text-danger-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {row.status} · {row.attempts}x
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label="Report builder" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
          <h2 className="font-bangla-display text-sm font-semibold">
            {draft.id ? t("Edit report", "রিপোর্ট এডিট") : t("New report", "নতুন রিপোর্ট")}
          </h2>

          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Name", "নাম")}</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Weekly revenue by day"
                className="min-h-9 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Dataset", "ডেটাসেট")}</span>
              <select
                value={draft.dataset}
                onChange={(e) =>
                  setDraft({ ...draft, dataset: e.target.value as DatasetKey, dimensions: [], metrics: [] })
                }
                className="min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              >
                {Object.entries(REPORT_DATASETS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.en}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="mb-1 text-xs text-muted-foreground">{t("Dimensions (max 3)", "ডাইমেনশন")}</legend>
              <div className="flex flex-wrap gap-2">
                {dataset.dimensions.map((dim) => (
                  <button
                    key={dim}
                    type="button"
                    aria-pressed={draft.dimensions.includes(dim)}
                    onClick={() => setDraft({ ...draft, dimensions: toggle(draft.dimensions, dim) })}
                    className={`min-h-8 rounded-fq-md border px-2 text-xs ${
                      draft.dimensions.includes(dim)
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-xs text-muted-foreground">{t("Metrics (max 6)", "মেট্রিক")}</legend>
              <div className="flex flex-wrap gap-2">
                {dataset.metrics.map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    aria-pressed={draft.metrics.includes(metric)}
                    onClick={() => setDraft({ ...draft, metrics: toggle(draft.metrics, metric) })}
                    className={`min-h-8 rounded-fq-md border px-2 text-xs ${
                      draft.metrics.includes(metric)
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">{t("Days", "দিন")}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.rangeDays}
                  onChange={(e) => setDraft({ ...draft, rangeDays: Number(e.target.value) })}
                  className="min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm tabular-nums"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">{t("Schedule", "শিডিউল")}</span>
                <select
                  value={draft.schedule}
                  onChange={(e) => setDraft({ ...draft, schedule: e.target.value as Draft["schedule"] })}
                  className="min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
                >
                  <option value="off">off</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">{t("Format", "ফরম্যাট")}</span>
                <select
                  value={draft.format}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value as Draft["format"] })}
                  className="min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
                >
                  <option value="csv">csv</option>
                  <option value="json">json</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">
                {t("Email recipients (comma separated)", "ইমেইল প্রাপক")}
              </span>
              <input
                value={draft.recipients}
                onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
                placeholder="ops@store.com, finance@store.com"
                className="min-h-9 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
              />
            </label>

            {!verdict.ok && draft.name.length > 1 && (
              <ul className="rounded-fq-md bg-warning-soft p-2 text-xs text-warning-foreground">
                {verdict.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!verdict.ok || draft.name.trim().length < 2 || save.isPending}
                onClick={() => save.mutate()}
                className="inline-flex min-h-9 items-center gap-2 rounded-fq-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                <Plus className="size-4" aria-hidden />
                {draft.id ? t("Update", "আপডেট") : t("Save report", "সেভ")}
              </button>
              {draft.id && (
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY)}
                  className="min-h-9 rounded-fq-md border border-border px-3 text-sm hover:bg-muted"
                >
                  {t("Cancel", "বাতিল")}
                </button>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Saved reports" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
          <h2 className="font-bangla-display text-sm font-semibold">{t("Saved reports", "সেভ করা রিপোর্ট")}</h2>
          <ul className="mt-3 space-y-2">
            {(reportsQuery.data?.reports ?? []).map((report) => (
              <li key={report.id} className="rounded-fq-md border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{report.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.dataset} · {report.range_days}d · {report.schedule}
                      {report.next_run_at && ` · next ${new Date(report.next_run_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`Run ${report.name}`}
                      onClick={() => run.mutate(report.id)}
                      disabled={run.isPending}
                      className="rounded-fq-md border border-border p-1.5 hover:bg-muted disabled:opacity-60"
                    >
                      <Play className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${report.name}`}
                      onClick={() =>
                        setDraft({
                          id: report.id,
                          name: report.name,
                          dataset: report.dataset as DatasetKey,
                          dimensions: (report.dimensions as string[]) ?? [],
                          metrics: (report.metrics as string[]) ?? [],
                          rangeDays: report.range_days,
                          schedule: report.schedule as Draft["schedule"],
                          format: report.format as Draft["format"],
                          recipients: ((report.recipients as string[]) ?? []).join(", "),
                        })
                      }
                      className="rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                    >
                      {t("Edit", "এডিট")}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${report.name}`}
                      onClick={() => remove.mutate(report.id)}
                      className="rounded-fq-md border border-border p-1.5 text-danger-foreground hover:bg-danger-soft"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {reportsQuery.data && reportsQuery.data.reports.length === 0 && (
              <li className="text-sm text-muted-foreground">
                {t("No saved reports yet.", "কোনো রিপোর্ট নেই।")}
              </li>
            )}
          </ul>

          {preview && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Preview", "প্রিভিউ")} · {preview.rows.length}
                </h3>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex min-h-8 items-center gap-1 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                >
                  <Download className="size-3.5" aria-hidden />
                  CSV
                </button>
              </div>
              <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Report preview</caption>
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      {preview.columns.map((c) => (
                        <th key={c} scope="col" className="py-1 pr-3">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {preview.columns.map((c) => (
                          <td key={c} className="py-1 pr-3 tabular-nums">{String(row[c] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
