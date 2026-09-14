/**
 * Owner scheduler desk (§9.3).
 *
 * The screen an on-call operator opens at 03:00. It answers four questions in
 * order of urgency: is anything failing, is anything silently not running, can
 * I run it now, and can I prove alerts would have woken me. Verdicts are
 * computed server-side from the ledger — this component renders judgement, it
 * never invents it.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  cronDeskFn,
  cronExportFn,
  cronSyncFn,
  cronToggleFn,
  cronTriggerFn,
  opsAlertTestFn,
} from "@/lib/cron-ops.functions";
import { isUnhealthy, type CronHealth } from "@/lib/cron-registry";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const field = "rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

const TONE: Record<CronHealth, "ok" | "warn" | "bad"> = {
  ok: "ok",
  running: "ok",
  slow: "warn",
  paused: "warn",
  late: "warn",
  never_run: "warn",
  stalled: "bad",
  failing: "bad",
};

function secs(v: number | null | undefined) {
  if (v == null) return "—";
  if (v < 90) return `${Math.round(v)}s`;
  if (v < 5_400) return `${Math.round(v / 60)}m`;
  if (v < 172_800) return `${Math.round(v / 3600)}h`;
  return `${Math.round(v / 86_400)}d`;
}

function ms(v: number | null | undefined) {
  if (v == null) return "—";
  return v < 1_000 ? `${v}ms` : `${(v / 1_000).toFixed(1)}s`;
}

function when(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : "—";
}

export function CronDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(cronDeskFn);
  const toggle = useServerFn(cronToggleFn);
  const trigger = useServerFn(cronTriggerFn);
  const sync = useServerFn(cronSyncFn);
  const exportFn = useServerFn(cronExportFn);
  const alertTest = useServerFn(opsAlertTestFn);

  const [onlyProblems, setOnlyProblems] = useState(false);
  const [format, setFormat] = useState<"crontab" | "github" | "pgcron">("crontab");
  const [exported, setExported] = useState<string | null>(null);
  const [runFilter, setRunFilter] = useState<string>("all");

  const { data, error, isFetching, isPending } = useQuery({
    queryKey: ["owner-cron"],
    queryFn: () => load(),
    // The desk is a live view of a one-minute fleet; a stale card here is a
    // false all-clear, so refresh on an interval rather than on focus alone.
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["owner-cron"] });

  const jobs = useMemo(() => {
    const all = data?.jobs ?? [];
    const filtered = onlyProblems ? all.filter((j) => isUnhealthy(j.health)) : all;
    // Worst first: an operator should never scroll to find the outage.
    const rank: Record<CronHealth, number> = {
      failing: 0,
      stalled: 1,
      late: 2,
      never_run: 3,
      slow: 4,
      paused: 5,
      running: 6,
      ok: 7,
    };
    return [...filtered].sort(
      (a, b) => rank[a.health] - rank[b.health] || b.overdueSeconds - a.overdueSeconds,
    );
  }, [data, onlyProblems]);

  const runs = useMemo(() => {
    const all = data?.runs ?? [];
    return runFilter === "all" ? all.slice(0, 40) : all.filter((r) => r.job_key === runFilter).slice(0, 40);
  }, [data, runFilter]);

  const toggleMut = useMutation({
    mutationFn: (v: { key: string; enabled: boolean; reason?: string | null }) => toggle({ data: v }),
    onSuccess: (r) => {
      toast.success(
        r.enabled
          ? t(`${r.key} resumed`, `${r.key} আবার চালু`)
          : t(`${r.key} paused`, `${r.key} থামানো হয়েছে`),
      );
      invalidate();
    },
    onError: () =>
      toast.error(t("Pausing a job needs a reason", "জব থামাতে একটি কারণ দরকার")),
  });

  const triggerMut = useMutation({
    mutationFn: (key: string) => trigger({ data: { key } }),
    onSuccess: (r) => {
      const detail = r.skipped
        ? t(`skipped (${r.reason ?? "already running"})`, `স্কিপ (${r.reason ?? "চলছে"})`)
        : `${r.httpStatus} · ${ms(r.durationMs)}`;
      toast[r.ok ? "success" : "error"](t(`Run finished: ${detail}`, `রান শেষ: ${detail}`));
      invalidate();
    },
    onError: () =>
      toast.error(
        t("The endpoint could not be reached in time", "নির্দিষ্ট সময়ে এন্ডপয়েন্টে পৌঁছানো যায়নি"),
      ),
  });

  const syncMut = useMutation({
    mutationFn: () => sync(),
    onSuccess: (r) => {
      toast.success(
        t(
          `Registry synced · ${r.inserted.length} new · ${r.orphaned.length} orphaned · ${r.reaped} leases reaped`,
          `রেজিস্ট্রি সিঙ্ক · ${r.inserted.length} নতুন · ${r.orphaned.length} অনাথ · ${r.reaped} লিজ মুক্ত`,
        ),
      );
      invalidate();
    },
    onError: () => toast.error(t("Sync could not run", "সিঙ্ক চালানো যায়নি")),
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { format } }),
    onSuccess: (r) => setExported(r.content),
    onError: () => toast.error(t("Export failed", "এক্সপোর্ট ব্যর্থ")),
  });

  const alertMut = useMutation({
    mutationFn: () => alertTest(),
    onSuccess: (r) =>
      toast.success(
        t(
          `Alert drill delivered to ${r.delivered}/${r.attempted} channel(s)`,
          `অ্যালার্ট ড্রিল ${r.delivered}/${r.attempted} চ্যানেলে পৌঁছেছে`,
        ),
      ),
    onError: () =>
      toast.error(
        t("No channel accepted the drill", "কোনো চ্যানেল ড্রিল গ্রহণ করেনি"),
      ),
  });

  const summary = data?.summary;
  // The fleet summary counts verdicts; "how bad is the worst one" is a view
  // concern, so it is derived here rather than widening the server contract.
  const worstOverdue = useMemo(
    () => (data?.jobs ?? []).reduce((max, j) => Math.max(max, j.overdueSeconds), 0),
    [data],
  );

  return (
    <section className="space-y-6">
      <OwnerHeader
        title={t("Scheduler desk", "শিডিউলার ডেস্ক")}
        subtitle={t(
          "Every scheduled job, its real last run, and proof the alert path works. A job that never runs never fails — this desk is how that stops being invisible.",
          "প্রতিটি নির্ধারিত জব, তার প্রকৃত শেষ রান এবং অ্যালার্ট পথ কাজ করার প্রমাণ। যে জব চলেই না সে ব্যর্থও হয় না — এই ডেস্ক সেটিকে দৃশ্যমান করে।",
        )}
      />

      <StatGrid>
        <StatCard label={t("Jobs registered", "নিবন্ধিত জব")} value={String(summary?.total ?? 0)} />
        <StatCard
          label={t("Failing / stalled", "ব্যর্থ / আটকে")}
          value={String((summary?.byHealth.failing ?? 0) + (summary?.byHealth.stalled ?? 0))}
        />
        <StatCard label={t("Late", "দেরি")} value={String(summary?.byHealth.late ?? 0)} />
        <StatCard
          label={t("Worst overdue", "সবচেয়ে দেরি")}
          value={secs(worstOverdue)}
        />
      </StatGrid>

      {data && !data.schedulerConfigured ? (
        <p className="rounded-fq-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {t(
            "No scheduler secret is configured, so nothing is calling these endpoints. Install a schedule below and set the shared secret before relying on any automation.",
            "কোনো শিডিউলার সিক্রেট সেট করা নেই, তাই এই এন্ডপয়েন্টগুলো কেউ ডাকছে না। নিচের শিডিউল ইনস্টল করে শেয়ার্ড সিক্রেট সেট করুন।",
          )}
        </p>
      ) : null}

      {data?.drillStale ? (
        <p className="rounded-fq-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {t(
            `No verified restore drill in the last ${data.objectives.drillMaxAgeDays} days (last: ${when(data.lastDrillAt)}). An untested backup is not a backup.`,
            `শেষ ${data.objectives.drillMaxAgeDays} দিনে কোনো ভেরিফায়েড রিস্টোর ড্রিল হয়নি (শেষ: ${when(data.lastDrillAt)})। পরীক্ষিত নয় এমন ব্যাকআপ ব্যাকআপ নয়।`,
          )}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">
          {t("This desk is owner-only and could not be read.", "এই ডেস্ক শুধু ওনারের, পড়া যায়নি।")}
        </p>
      ) : null}

      {/* --------------------------------------------------------------- fleet */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{t("Job fleet", "জব ফ্লিট")}</h3>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
            {t("Only problems", "শুধু সমস্যা")}
          </label>
          <button
            type="button"
            className={btn}
            disabled={syncMut.isPending}
            onClick={() => syncMut.mutate()}
          >
            {t("Sync registry", "রেজিস্ট্রি সিঙ্ক")}
          </button>
          <button
            type="button"
            className={btn}
            disabled={alertMut.isPending}
            onClick={() => alertMut.mutate()}
          >
            {t("Test alerting", "অ্যালার্ট পরীক্ষা")}
          </button>
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {isPending ? t("Loading…", "লোড হচ্ছে…") : isFetching ? t("Refreshing…", "রিফ্রেশ হচ্ছে…") : `${jobs.length}`}
          </p>
        </div>

        <OwnerTable
          head={[
            t("Job", "জব"),
            t("Schedule", "শিডিউল"),
            t("Health", "অবস্থা"),
            t("Last run", "শেষ রান"),
            t("Overdue", "দেরি"),
            t("Duration", "সময়"),
            t("Fails", "ব্যর্থতা"),
            t("Actions", "অ্যাকশন"),
          ]}
        >
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {onlyProblems
                  ? t("Every job is inside policy.", "প্রতিটি জব নীতির ভেতরে আছে।")
                  : t("No jobs registered yet — run Sync registry.", "কোনো জব নিবন্ধিত নয় — রেজিস্ট্রি সিঙ্ক চালান।")}
              </td>
            </tr>
          ) : (
            jobs.map((j) => (
              <tr key={j.definition.key} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <p className="text-sm font-medium">{j.definition.label}</p>
                  <p className="text-xs text-muted-foreground">{j.definition.key}</p>
                  {j.reasons.length ? (
                    <p className="mt-1 text-xs text-destructive">{j.reasons.join(" · ")}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs">
                  <p>{j.scheduleText}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {t("next", "পরবর্তী")} {when(j.nextRunAt)}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <StatePill tone={TONE[j.health]}>{j.health}</StatePill>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  <p>{when(j.state?.lastRunAt ?? null)}</p>
                  <p className="text-muted-foreground">
                    {t("ok", "সফল")} {secs(j.sinceSuccessSeconds)} {t("ago", "আগে")}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {j.overdueSeconds > 0 ? secs(j.overdueSeconds) : "—"}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  <p>{ms(j.state?.lastDurationMs ?? null)}</p>
                  <p className="text-muted-foreground">
                    {t("sla", "এসএলএ")} {ms(j.definition.slaMaxDurationMs)}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {j.state?.consecutiveFailures ?? 0} / {(j.failureRate * 100).toFixed(0)}%
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn}
                      disabled={triggerMut.isPending}
                      onClick={() => triggerMut.mutate(j.definition.key)}
                    >
                      {t("Run now", "এখন চালান")}
                    </button>
                    {j.state?.enabled === false ? (
                      <button
                        type="button"
                        className={btn}
                        disabled={toggleMut.isPending}
                        onClick={() =>
                          toggleMut.mutate({ key: j.definition.key, enabled: true, reason: null })
                        }
                      >
                        {t("Resume", "আবার চালু")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btn}
                        disabled={toggleMut.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            t("Why is this job being paused?", "এই জব কেন থামানো হচ্ছে?") ?? "",
                          );
                          if (!reason || reason.trim().length < 4) return;
                          toggleMut.mutate({ key: j.definition.key, enabled: false, reason });
                        }}
                      >
                        {t("Pause", "থামান")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </OwnerTable>
      </div>

      {/* ---------------------------------------------------------- run ledger */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="text-base font-semibold">{t("Run ledger", "রান লেজার")}</h3>
          <label className="space-y-1 text-xs font-medium">
            <span className="sr-only">{t("Job", "জব")}</span>
            <select className={field} value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
              <option value="all">{t("All jobs", "সব জব")}</option>
              {(data?.jobs ?? []).map((j) => (
                <option key={j.definition.key} value={j.definition.key}>
                  {j.definition.key}
                </option>
              ))}
            </select>
          </label>
        </div>

        <OwnerTable
          head={[
            t("Started", "শুরু"),
            t("Job", "জব"),
            t("Trigger", "ট্রিগার"),
            t("Status", "স্ট্যাটাস"),
            t("Duration", "সময়"),
            t("Detail", "বিবরণ"),
          ]}
        >
          {runs.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("No runs recorded yet.", "এখনো কোনো রান রেকর্ড হয়নি।")}
              </td>
            </tr>
          ) : (
            runs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs tabular-nums">{when(r.started_at)}</td>
                <td className="px-3 py-2 text-xs">{r.job_key}</td>
                <td className="px-3 py-2 text-xs">{r.trigger}</td>
                <td className="px-3 py-2">
                  <StatePill
                    tone={
                      r.status === "success"
                        ? "ok"
                        : r.status === "running" || r.status === "skipped"
                          ? "warn"
                          : "bad"
                    }
                  >
                    {r.status}
                  </StatePill>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">{ms(r.duration_ms)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.error_message ?? r.error_code ?? JSON.stringify(r.stats ?? {}).slice(0, 120)}
                </td>
              </tr>
            ))
          )}
        </OwnerTable>
      </div>

      {/* -------------------------------------------------------- alert history */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{t("Alert delivery", "অ্যালার্ট ডেলিভারি")}</h3>
        <p className="text-xs text-muted-foreground">
          {(data?.channels ?? []).length === 0
            ? t("No alert channel is configured — nobody would be paged.", "কোনো অ্যালার্ট চ্যানেল নেই — কাউকে জানানো হবে না।")
            : (data?.channels ?? [])
                .map((c) => `${c.label} (${c.kind}, ≥${c.minSeverity}${c.configured ? "" : ", unset"})`)
                .join(" · ")}
        </p>
        <OwnerTable
          head={[
            t("Raised", "উত্থাপিত"),
            t("Severity", "গুরুত্ব"),
            t("Title", "শিরোনাম"),
            t("Status", "স্ট্যাটাস"),
            t("Attempts", "প্রচেষ্টা"),
          ]}
        >
          {(data?.alerts ?? []).length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("No alerts raised yet.", "এখনো কোনো অ্যালার্ট হয়নি।")}
              </td>
            </tr>
          ) : (
            (data?.alerts ?? []).map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs tabular-nums">{when(a.created_at)}</td>
                <td className="px-3 py-2">
                  <StatePill tone={a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "ok"}>
                    {a.severity}
                  </StatePill>
                </td>
                <td className="px-3 py-2 text-xs">{a.title}</td>
                <td className="px-3 py-2">
                  <StatePill tone={a.status === "sent" ? "ok" : a.status === "pending" ? "warn" : "bad"}>
                    {a.status}
                  </StatePill>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {a.attempts}
                  {a.last_error ? ` · ${a.last_error.slice(0, 60)}` : ""}
                </td>
              </tr>
            ))
          )}
        </OwnerTable>
      </div>

      {/* ------------------------------------------------------------- installs */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{t("Install the schedule", "শিডিউল ইনস্টল করুন")}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Generated from the registry, so the installed schedule and the code can never drift. The secret is referenced, never printed.",
            "রেজিস্ট্রি থেকে তৈরি, তাই ইনস্টল করা শিডিউল ও কোড আলাদা হবে না। সিক্রেট শুধু রেফারেন্স হিসেবে থাকে।",
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium">
            <span className="sr-only">{t("Format", "ফরম্যাট")}</span>
            <select
              className={field}
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="crontab">crontab</option>
              <option value="github">GitHub Actions</option>
              <option value="pgcron">pg_cron</option>
            </select>
          </label>
          <button
            type="button"
            className={btn}
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            {t("Generate", "তৈরি করুন")}
          </button>
          {exported ? (
            <button
              type="button"
              className={btn}
              onClick={() => {
                void navigator.clipboard?.writeText(exported);
                toast.success(t("Copied", "কপি হয়েছে"));
              }}
            >
              {t("Copy", "কপি")}
            </button>
          ) : null}
        </div>
        {exported ? (
          <pre className="max-h-80 overflow-auto rounded-fq-md border border-border bg-muted/40 p-3 text-xs">
            {exported}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
