import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  tenancyCancelPurgeFn,
  tenancyDeskFn,
  tenancyExecutePurgeFn,
  tenancyRequestPurgeFn,
} from "@/lib/tenancy.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/tenancy")({
  head: () => ({
    meta: [
      { title: "Tenancy foundation — Framique owner console" },
      {
        name: "description",
        content:
          "Tenant isolation posture, schema drift against the committed snapshot, tombstone counts and the GDPR-grade store purge queue for Framique.",
      },
      { property: "og:title", content: "Tenancy foundation — Framique owner console" },
      {
        property: "og:description",
        content: "Isolation posture, schema drift and the store purge queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenancyDesk,
});

const btn =
  "min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const field = "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

function TenancyDesk() {
  const { t, tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(tenancyDeskFn);
  const request = useServerFn(tenancyRequestPurgeFn);
  const cancel = useServerFn(tenancyCancelPurgeFn);
  const execute = useServerFn(tenancyExecutePurgeFn);

  const { data, isLoading } = useQuery({ queryKey: ["tenancy-desk"], queryFn: () => load() });
  const [merchantId, setMerchantId] = useState("");
  const [reason, setReason] = useState("");
  const [delayDays, setDelayDays] = useState(7);

  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ["tenancy-desk"] });
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : tk("common.error"));

  const askPurge = useMutation({
    mutationFn: () => request({ data: { merchantId, reason, delayDays } }),
    onSuccess: () => {
      setReason("");
      setMerchantId("");
      done(tk("tenancy.purge_queued"));
    },
    onError: fail,
  });
  const cancelPurge = useMutation({
    mutationFn: (id: string) => cancel({ data: { requestId: id, reason: "owner cancelled" } }),
    onSuccess: () => done(tk("tenancy.purge_cancelled")),
    onError: fail,
  });
  const runPurge = useMutation({
    mutationFn: (id: string) => execute({ data: { requestId: id } }),
    onSuccess: () => done(tk("tenancy.purge_executed")),
    onError: fail,
  });

  const drift = data?.drift ?? [];
  const isolation = data?.isolation;
  const tombstones = (data?.softDelete ?? []).reduce((n, r) => n + r.tombstoned, 0);

  return (
    <section className="space-y-6">
      <OwnerHeader title={tk("tenancy.title")} subtitle={tk("tenancy.subtitle")} />

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      <StatGrid>
        <StatCard label={tk("tenancy.tables")} value={String(isolation?.total ?? 0)} />
        <StatCard label={tk("tenancy.drift")} value={String(drift.length)} />
        <StatCard label={tk("tenancy.tombstones")} value={String(tombstones)} />
        <StatCard label={tk("tenancy.purge_pending")} value={String(data?.counts.pending ?? 0)} />
      </StatGrid>

      {/* Isolation posture: RLS off, or on with zero policies, are the leak shapes. */}
      <article className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{tk("tenancy.isolation")}</h3>
        <p className="text-xs text-muted-foreground">{tk("tenancy.isolation_hint")}</p>
        <div className="flex flex-wrap gap-2">
          <StatePill tone={(isolation?.rlsOff.length ?? 0) === 0 ? "ok" : "bad"}>
            {t("RLS off", "RLS বন্ধ")}: {isolation?.rlsOff.length ?? 0}
          </StatePill>
          <StatePill tone={(isolation?.noPolicy.length ?? 0) === 0 ? "ok" : "warn"}>
            {t("No policy", "পলিসি নেই")}: {isolation?.noPolicy.length ?? 0}
          </StatePill>
        </div>
        {(isolation?.rlsOff.length ?? 0) + (isolation?.noPolicy.length ?? 0) > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {isolation?.rlsOff.map((n) => (
              <li key={`off-${n}`}>! {n} — {t("RLS disabled", "RLS নিষ্ক্রিয়")}</li>
            ))}
            {isolation?.noPolicy.map((n) => (
              <li key={`np-${n}`}>• {n} — {t("locked, no policy", "লক করা, পলিসি নেই")}</li>
            ))}
          </ul>
        ) : null}
      </article>

      {/* Schema drift against supabase/schema.fingerprint.json. */}
      <article className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{tk("tenancy.drift")}</h3>
        <p className="text-xs text-muted-foreground">{tk("tenancy.drift_hint")}</p>
        {drift.length === 0 ? (
          <StatePill tone="ok">{tk("tenancy.no_drift")}</StatePill>
        ) : (
          <ul className="space-y-1 text-xs">
            {drift.map((d) => (
              <li key={`${d.kind}-${d.subject}-${d.detail}`} className="flex items-center gap-2">
                <StatePill tone={d.kind === "rls" ? "bad" : "warn"}>{d.kind}</StatePill>
                <code className="font-mono">{d.subject}</code>
                <span className="text-muted-foreground">{d.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Purge lifecycle: request suspends, cooling window elapses, then delete. */}
      <article className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{tk("tenancy.purge")}</h3>
        <p className="text-xs text-muted-foreground">{tk("tenancy.purge_hint")}</p>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            askPurge.mutate();
          }}
        >
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{tk("tenancy.store")}</span>
            <select
              className={field}
              required
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              <option value="">—</option>
              {(data?.merchants ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{tk("tenancy.reason")}</span>
            <input
              className={field}
              required
              minLength={8}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">{tk("tenancy.cooling")}</span>
            <input
              className={`${field} tabular-nums`}
              type="number"
              min={0}
              max={90}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
            />
          </label>
          <button type="submit" className={`${btn} self-end`} disabled={askPurge.isPending}>
            {tk("tenancy.queue_purge")}
          </button>
        </form>

        <OwnerTable
          head={[
            tk("tenancy.store"),
            tk("tenancy.status"),
            tk("tenancy.cooling"),
            tk("tenancy.reason"),
            "",
          ]}
        >
          {(data?.rows ?? []).map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2">{r.merchantName ?? r.merchant_id}</td>
              <td className="px-3 py-2">
                <StatePill
                  tone={r.status === "executed" ? "bad" : r.status === "pending" ? "warn" : "ok"}
                >
                  {r.status}
                </StatePill>
              </td>
              <td className="px-3 py-2 tabular-nums text-xs">
                {new Date(r.scheduled_for).toLocaleString("en-GB")}
                {r.status === "pending" && !r.coolingElapsed ? (
                  <span className="ml-2 text-muted-foreground">{tk("tenancy.waiting")}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason}</td>
              <td className="px-3 py-2">
                {r.status === "pending" ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => cancelPurge.mutate(r.id)}
                      disabled={cancelPurge.isPending}
                    >
                      {tk("tenancy.cancel")}
                    </button>
                    <button
                      type="button"
                      className={`${btn} border-destructive text-destructive`}
                      disabled={!r.coolingElapsed || runPurge.isPending}
                      onClick={() => runPurge.mutate(r.id)}
                    >
                      {tk("tenancy.execute")}
                    </button>
                  </span>
                ) : r.row_counts ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Object.values(r.row_counts).reduce((a, b) => a + b, 0)} {tk("tenancy.rows")}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </OwnerTable>
      </article>

      {/* Tombstones: a merchant delete hides, it never destroys history. */}
      <article className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{tk("tenancy.tombstones")}</h3>
        <p className="text-xs text-muted-foreground">{tk("tenancy.tombstones_hint")}</p>
        <OwnerTable head={[tk("tenancy.table"), tk("tenancy.live"), tk("tenancy.tombstoned")]}>
          {(data?.softDelete ?? []).map((r) => (
            <tr key={r.table} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{r.table}</td>
              <td className="px-3 py-2 tabular-nums">{r.live}</td>
              <td className="px-3 py-2 tabular-nums">{r.tombstoned}</td>
            </tr>
          ))}
        </OwnerTable>
      </article>

      {/* Runtime: cache + span counters, the same series Prometheus scrapes. */}
      <article className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">{tk("tenancy.runtime")}</h3>
        <p className="text-xs text-muted-foreground">{tk("tenancy.runtime_hint")}</p>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          {Object.entries(data?.runtime.metrics.counters ?? {}).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-fq-sm bg-muted/40 px-2 py-1">
              <dt className="truncate font-mono">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 rounded-fq-sm bg-muted/40 px-2 py-1">
            <dt className="font-mono">cache_entries</dt>
            <dd className="tabular-nums">{data?.runtime.cache.entries ?? 0}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
