import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  opsBackupRecordFn,
  opsDeskFn,
  opsReplayFn,
  opsRetentionSweepFn,
} from "@/lib/ops.functions";
import { backupHealth, dlqSeverity, RETENTION_POLICY, type DlqSeverity } from "@/lib/ops";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";
import { CronDesk } from "@/components/root/CronDesk";

export const Route = createFileRoute("/root/ops")({
  head: () => ({
    meta: [
      { title: "Reliability desk — Framique owner console" },
      {
        name: "description",
        content:
          "Unified dead-letter queue for payment and courier webhooks, backup and restore-drill ledger, and log retention sweeps for the Framique platform.",
      },
      { property: "og:title", content: "Reliability desk — Framique owner console" },
      {
        property: "og:description",
        content: "Replay failed webhooks, prove restores work, and keep log retention honest.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpsDesk,
});

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const field = "rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

const SEVERITY_TONE: Record<DlqSeverity, "ok" | "warn" | "bad"> = {
  fresh: "warn",
  aging: "warn",
  stale: "bad",
  critical: "bad",
};

function hours(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n < 48 ? `${n.toFixed(1)}h` : `${(n / 24).toFixed(1)}d`;
}

function OpsDesk() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(opsDeskFn);
  const replay = useServerFn(opsReplayFn);
  const record = useServerFn(opsBackupRecordFn);
  const sweep = useServerFn(opsRetentionSweepFn);

  const [source, setSource] = useState<"all" | "payments" | "courier">("all");
  const [drillRows, setDrillRows] = useState("");
  const [drillNote, setDrillNote] = useState("");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["owner-ops"],
    queryFn: () => load(),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => source === "all" || i.source === source),
    [data, source],
  );
  const summary = data?.summary;
  const health = useMemo(
    () =>
      backupHealth(
        (data?.backups ?? []).map((b) => ({
          id: b.id,
          kind: b.kind as "backup" | "restore_drill",
          status: b.status as "running" | "passed" | "failed",
          startedAt: b.started_at,
          finishedAt: b.finished_at,
          rowsVerified: Number(b.rows_verified ?? 0),
        })),
      ),
    [data],
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["owner-ops"] });

  const replayMut = useMutation({
    mutationFn: (v: { id: string; source: "payments" | "courier" }) => replay({ data: v }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](
        r.ok
          ? t("Replayed successfully", "রিপ্লে সফল হয়েছে")
          : t(`Replay failed: ${r.reason ?? r.outcome}`, `রিপ্লে ব্যর্থ: ${r.reason ?? r.outcome}`),
      );
      invalidate();
    },
    onError: () => toast.error(t("Replay could not run", "রিপ্লে চালানো যায়নি")),
  });

  const drillMut = useMutation({
    mutationFn: (v: { status: "passed" | "failed" }) =>
      record({
        data: {
          kind: "restore_drill",
          status: v.status,
          rowsVerified: Number(drillRows) || 0,
          notes: drillNote.trim() || null,
        },
      }),
    onSuccess: () => {
      setDrillRows("");
      setDrillNote("");
      toast.success(t("Restore drill recorded", "রিস্টোর ড্রিল রেকর্ড হয়েছে"));
      invalidate();
    },
    onError: () =>
      toast.error(
        t(
          "A passed drill needs a verified row count",
          "পাস করা ড্রিলে ভেরিফায়েড রো সংখ্যা লাগবে",
        ),
      ),
  });

  const sweepMut = useMutation({
    mutationFn: () => sweep(),
    onSuccess: (r) => {
      const deleted = r.swept.reduce((sum, s) => sum + Number(s.deleted ?? 0), 0);
      toast.success(t(`Retention sweep removed ${deleted} rows`, `রিটেনশন সুইপে ${deleted} সারি মুছেছে`));
      invalidate();
    },
    onError: () => toast.error(t("Sweep could not run", "সুইপ চালানো যায়নি")),
  });

  return (
    <div className="space-y-10">
    <section className="space-y-6">
      <OwnerHeader
        title={t("Reliability desk", "রিলায়াবিলিটি ডেস্ক")}
        subtitle={t(
          "One queue for every failed webhook, one ledger for backups and restore drills, one place to prove retention actually runs.",
          "প্রতিটি ব্যর্থ ওয়েবহুকের একটি কিউ, ব্যাকআপ ও রিস্টোর ড্রিলের একটি লেজার, রিটেনশন সত্যিই চলছে তা প্রমাণের একটি জায়গা।",
        )}
      />

      <StatGrid>
        <StatCard label={t("Dead letters", "ডেড লেটার")} value={String(summary?.total ?? 0)} />
        <StatCard
          label={t("Critical / stale", "ক্রিটিক্যাল / বাসি")}
          value={String((summary?.bySeverity.critical ?? 0) + (summary?.bySeverity.stale ?? 0))}
        />
        <StatCard label={t("Last backup", "শেষ ব্যাকআপ")} value={hours(health.backupAgeHours)} />
        <StatCard label={t("Last restore drill", "শেষ রিস্টোর ড্রিল")} value={hours(health.drillAgeHours)} />
      </StatGrid>

      {!health.backupOk || !health.drillOk ? (
        <p className="rounded-fq-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {t(
            "Backup policy breach: a passing backup is required every 24 hours and a verified restore drill every 30 days.",
            "ব্যাকআপ নীতি ভঙ্গ: প্রতি ২৪ ঘণ্টায় সফল ব্যাকআপ এবং প্রতি ৩০ দিনে ভেরিফায়েড রিস্টোর ড্রিল দরকার।",
          )}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">
          {t("This desk is owner-only and could not be read.", "এই ডেস্ক শুধু ওনারের, পড়া যায়নি।")}
        </p>
      ) : null}

      {/* ------------------------------------------------------- dead letters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="text-base font-semibold">{t("Dead-letter queue", "ডেড-লেটার কিউ")}</h3>
          <label className="space-y-1 text-xs font-medium">
            <span className="sr-only">{t("Source", "সোর্স")}</span>
            <select
              className={field}
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
            >
              <option value="all">{t("All pipelines", "সব পাইপলাইন")}</option>
              <option value="payments">{t("Payments", "পেমেন্ট")}</option>
              <option value="courier">{t("Couriers", "কুরিয়ার")}</option>
            </select>
          </label>
          <p className="pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {isFetching ? t("Refreshing…", "রিফ্রেশ হচ্ছে…") : `${items.length}`}
          </p>
        </div>

        <OwnerTable
          head={[
            t("Age", "বয়স"),
            t("Pipeline", "পাইপলাইন"),
            t("Provider", "প্রোভাইডার"),
            t("Merchant", "মার্চেন্ট"),
            t("Reason", "কারণ"),
            t("Attempts", "চেষ্টা"),
            "",
          ]}
        >
          {isLoading ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("Loading…", "লোড হচ্ছে…")}
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("Queue is empty. Nothing is waiting on a human.", "কিউ খালি। কারও হস্তক্ষেপ লাগছে না।")}
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const sev = dlqSeverity(item.receivedAt, item.attempts);
              return (
                <tr key={`${item.source}-${item.id}`} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <StatePill tone={SEVERITY_TONE[sev]}>{sev}</StatePill>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {new Date(item.receivedAt).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">{item.source}</td>
                  <td className="px-3 py-2 text-xs">{item.provider}</td>
                  <td className="px-3 py-2 text-xs">{item.merchantName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{item.reason ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{item.attempts}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className={btn}
                      disabled={replayMut.isPending}
                      onClick={() => replayMut.mutate({ id: item.id, source: item.source })}
                    >
                      {t("Replay", "রিপ্লে")}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </OwnerTable>
      </div>

      {/* ------------------------------------------------------------ backups */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-fq-md border border-border p-4">
          <h3 className="text-base font-semibold">{t("Restore drill", "রিস্টোর ড্রিল")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "An untested backup is not a backup. Record the row count you verified after restoring into the drill database.",
              "পরীক্ষা না করা ব্যাকআপ ব্যাকআপ নয়। ড্রিল ডাটাবেসে রিস্টোরের পরে যাচাই করা সারি সংখ্যা লিখুন।",
            )}
          </p>
          <label className="block space-y-1 text-xs font-medium">
            {t("Rows verified", "যাচাই করা সারি")}
            <input
              className={`${field} block w-full tabular-nums`}
              inputMode="numeric"
              value={drillRows}
              onChange={(e) => setDrillRows(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="block space-y-1 text-xs font-medium">
            {t("Notes", "নোট")}
            <textarea
              className={`${field} block w-full`}
              rows={2}
              value={drillNote}
              onChange={(e) => setDrillNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              disabled={drillMut.isPending}
              onClick={() => drillMut.mutate({ status: "passed" })}
            >
              {t("Record pass", "পাস রেকর্ড")}
            </button>
            <button
              type="button"
              className={btn}
              disabled={drillMut.isPending}
              onClick={() => drillMut.mutate({ status: "failed" })}
            >
              {t("Record failure", "ব্যর্থতা রেকর্ড")}
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-fq-md border border-border p-4">
          <h3 className="text-base font-semibold">{t("Retention", "রিটেনশন")}</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {RETENTION_POLICY.map((r) => (
              <li key={r.table} className="flex justify-between gap-3">
                <span>{r.note}</span>
                <span className="tabular-nums">{r.days}d</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={btn}
            disabled={sweepMut.isPending}
            onClick={() => sweepMut.mutate()}
          >
            {t("Run sweep now", "এখনই সুইপ চালান")}
          </button>
          <p className="text-xs text-muted-foreground">
            {t(
              "Ledgers, audit rows and money records are never swept.",
              "লেজার, অডিট ও অর্থ সংক্রান্ত রেকর্ড কখনো মুছে ফেলা হয় না।",
            )}
          </p>
        </div>
      </div>

      <OwnerTable
        head={[
          t("When", "কখন"),
          t("Kind", "ধরন"),
          t("Status", "অবস্থা"),
          t("Rows verified", "যাচাই করা সারি"),
          t("Notes", "নোট"),
        ]}
      >
        {(data?.backups ?? []).length === 0 ? (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("No backup runs recorded yet.", "এখনো কোনো ব্যাকআপ রান রেকর্ড হয়নি।")}
            </td>
          </tr>
        ) : (
          (data?.backups ?? []).map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-2 text-xs tabular-nums">
                {new Date(b.started_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs">{b.kind}</td>
              <td className="px-3 py-2">
                <StatePill tone={b.status === "passed" ? "ok" : b.status === "running" ? "warn" : "bad"}>
                  {b.status}
                </StatePill>
              </td>
              <td className="px-3 py-2 text-xs tabular-nums">{b.rows_verified}</td>
              <td className="px-3 py-2 text-xs">{b.notes ?? "—"}</td>
            </tr>
          ))
        )}
      </OwnerTable>

      <OwnerTable
        head={[t("Swept at", "সুইপের সময়"), t("Table", "টেবিল"), t("Cutoff", "কাটঅফ"), t("Removed", "মুছেছে")]}
      >
        {(data?.retention ?? []).length === 0 ? (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("No retention sweeps recorded yet.", "এখনো কোনো রিটেনশন সুইপ হয়নি।")}
            </td>
          </tr>
        ) : (
          (data?.retention ?? []).map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2 text-xs tabular-nums">{new Date(r.ran_at).toLocaleString()}</td>
              <td className="px-3 py-2 text-xs">{r.table_name}</td>
              <td className="px-3 py-2 text-xs tabular-nums">
                {new Date(r.cutoff).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-xs tabular-nums">{r.deleted_rows}</td>
            </tr>
          ))
        )}
      </OwnerTable>
    </section>

      {/* Scheduling is the other half of reliability: replaying a dead letter is
          worthless if the job that produces them stopped running. */}
      <CronDesk />
    </div>
  );
}
