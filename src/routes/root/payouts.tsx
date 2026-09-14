import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { formatMinor } from "@/lib/revenue";
import { PAYOUT_STATES } from "@/lib/payouts";
import {
  ownerCancelPayoutFn,
  ownerPayoutsFn,
  ownerPlaceHoldFn,
  ownerReleaseHoldFn,
} from "@/lib/owner-desk.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";

export const Route = createFileRoute("/root/payouts")({
  head: () => ({
    meta: [
      { title: "Payout queue — Framique owner console" },
      {
        name: "description",
        content:
          "Cross-tenant payout desk: every store's payout queue, platform holds and cancellations, each one audited.",
      },
      { property: "og:title", content: "Payout queue — Framique owner console" },
      {
        property: "og:description",
        content: "Review, hold and cancel merchant payouts across every Framique store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PayoutDesk,
});

const CANCELLABLE = new Set(["draft", "requested", "approved", "failed"]);

function stateTone(state: string): "ok" | "warn" | "bad" {
  if (state === "paid") return "ok";
  if (state === "failed" || state === "reversed") return "bad";
  return "warn";
}

function PayoutDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerPayoutsFn);
  const placeHold = useServerFn(ownerPlaceHoldFn);
  const releaseHold = useServerFn(ownerReleaseHoldFn);
  const cancelPayout = useServerFn(ownerCancelPayoutFn);

  const [state, setState] = useState<string>("all");
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);
  const [holdMerchant, setHoldMerchant] = useState("");
  const [holdAmount, setHoldAmount] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["owner-payouts", state],
    queryFn: () => load({ data: { state } }),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["owner-payouts"] });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "unknown");

  const holdMutation = useMutation({
    mutationFn: () =>
      placeHold({
        data: {
          merchantId: holdMerchant,
          amountMinor: Math.round(Number(holdAmount || "0") * 100),
          reason: holdReason,
        },
      }),
    onSuccess: () => {
      setHoldAmount("");
      setHoldReason("");
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const releaseMutation = useMutation({
    mutationFn: (holdId: string) => releaseHold({ data: { holdId } }),
    onSuccess: refresh,
    onError: fail,
  });
  const cancelMutation = useMutation({
    mutationFn: (payoutId: string) =>
      cancelPayout({ data: { payoutId, reason: "Cancelled from the platform payout desk" } }),
    onSuccess: () => {
      setPending(null);
      refresh();
    },
    onError: (e) => {
      setPending(null);
      fail(e);
    },
  });

  const payouts = data?.payouts ?? [];
  const holds = data?.holds ?? [];
  const totals = data?.totals;

  return (
    <section className="space-y-6">
      <OwnerHeader title={tk("owner.payouts.title")} subtitle={tk("owner.payouts.subtitle")} />

      {error ? (
        <p role="alert" className="rounded-fq-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <StatGrid>
        <StatCard
          label={tk("owner.payouts.open")}
          value={`${totals?.openCount ?? 0} · ${formatMinor(totals?.openMinor ?? 0, "BDT")}`}
        />
        <StatCard label={tk("owner.payouts.paid")} value={formatMinor(totals?.paidMinor ?? 0, "BDT")} />
        <StatCard label={tk("owner.payouts.held")} value={formatMinor(totals?.heldMinor ?? 0, "BDT")} />
        <StatCard label={tk("owner.payouts.failed")} value={String(totals?.failedCount ?? 0)} />
      </StatGrid>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block pb-1 font-medium">{tk("owner.payouts.filter_state")}</span>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">{tk("owner.payouts.all_states")}</option>
            {PAYOUT_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      {!isLoading && payouts.length === 0 ? (
        <p className="rounded-fq-md border border-border p-4 text-sm text-muted-foreground">
          {tk("owner.payouts.empty")}
        </p>
      ) : null}

      {payouts.length > 0 ? (
        <OwnerTable
          head={[
            tk("owner.payouts.tenant"),
            tk("owner.payouts.amount"),
            tk("owner.payouts.net"),
            tk("owner.payouts.destination"),
            tk("owner.payouts.state"),
            tk("owner.payouts.requested"),
            "",
          ]}
        >
          {payouts.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-3 py-2">{p.merchantName}</td>
              <td className="px-3 py-2 tabular-nums">{formatMinor(p.amountMinor, p.currency)}</td>
              <td className="px-3 py-2 tabular-nums">{formatMinor(p.netMinor, p.currency)}</td>
              <td className="px-3 py-2">
                <span className="font-mono text-xs">{p.destination}</span>
              </td>
              <td className="px-3 py-2">
                <StatePill tone={stateTone(p.state)}>{p.state}</StatePill>
                {p.failureCode ? (
                  <span className="block text-xs text-muted-foreground">{p.failureCode}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {new Date(p.requestedAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-right">
                {CANCELLABLE.has(p.state) ? (
                  <button
                    type="button"
                    onClick={() => setPending({ id: p.id, label: p.merchantName })}
                    className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {tk("owner.payouts.cancel")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </OwnerTable>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{tk("owner.payouts.holds")}</h3>
        <p className="text-sm text-muted-foreground">{tk("owner.payouts.holds_hint")}</p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            holdMutation.mutate();
          }}
        >
          <label className="text-sm">
            <span className="block pb-1 font-medium">{tk("owner.payouts.tenant")}</span>
            <select
              required
              value={holdMerchant}
              onChange={(e) => setHoldMerchant(e.target.value)}
              className="rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {(data?.tenants ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block pb-1 font-medium">{tk("owner.payouts.hold_amount")}</span>
            <input
              required
              inputMode="decimal"
              value={holdAmount}
              onChange={(e) => setHoldAmount(e.target.value)}
              className="w-32 rounded-fq-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-sm">
            <span className="block pb-1 font-medium">{tk("owner.payouts.hold_reason")}</span>
            <input
              required
              minLength={3}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              className="w-64 rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={holdMutation.isPending}
            className="rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {tk("owner.payouts.place_hold")}
          </button>
        </form>

        {holds.length > 0 ? (
          <OwnerTable
            head={[
              tk("owner.payouts.tenant"),
              tk("owner.payouts.amount"),
              tk("owner.payouts.hold_reason"),
              tk("owner.payouts.state"),
              "",
            ]}
          >
            {holds.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-3 py-2">{h.merchantName}</td>
                <td className="px-3 py-2 tabular-nums">{formatMinor(h.amountMinor, "BDT")}</td>
                <td className="px-3 py-2">{h.reason}</td>
                <td className="px-3 py-2">
                  <StatePill tone={h.releasedAt ? "ok" : "warn"}>
                    {h.releasedAt ? tk("owner.payouts.released") : tk("owner.payouts.active_hold")}
                  </StatePill>
                </td>
                <td className="px-3 py-2 text-right">
                  {h.releasedAt ? null : (
                    <button
                      type="button"
                      onClick={() => releaseMutation.mutate(h.id)}
                      className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      {tk("owner.payouts.release")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </OwnerTable>
        ) : (
          <p className="rounded-fq-md border border-border p-4 text-sm text-muted-foreground">
            {tk("owner.payouts.no_holds")}
          </p>
        )}
      </div>

      <RootConfirmDialog
        open={Boolean(pending)}
        title={tk("owner.payouts.cancel")}
        description={tk("owner.payouts.cancel_hint")}
        confirmLabel={tk("owner.payouts.cancel")}
        tone="danger"
        busy={cancelMutation.isPending}
        onConfirm={() => pending && cancelMutation.mutate(pending.id)}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
