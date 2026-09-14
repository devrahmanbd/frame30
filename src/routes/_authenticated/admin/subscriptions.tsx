import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { fmtMinor } from "@/lib/money";
import { dunningPlan, subscriptionStatusLabel } from "@/lib/commerce-desk";
import {
  subscriptionActionFn,
  subscriptionBillingRunFn,
  subscriptionsLoadFn,
} from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions & recurring charges — Framique Admin" },
      {
        name: "description",
        content:
          "Manage recurring plans, pause or cancel a customer's subscription, and run the billing cycle with retries that never charge the same period twice.",
      },
      { property: "og:title", content: "Subscriptions and recurring charges" },
      { property: "og:description", content: "Recurring billing with safe retries and clear dunning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionsPage,
});

const CHARGE_TONE: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  processing: "bg-info-soft text-info-foreground",
  paid: "bg-success-soft text-success-foreground",
  failed: "bg-danger-soft text-danger-foreground",
  skipped: "bg-warning-soft text-warning-foreground",
};

function SubscriptionsPage() {
  const qc = useQueryClient();
  const load = useServerFn(subscriptionsLoadFn);
  const act = useServerFn(subscriptionActionFn);
  const run = useServerFn(subscriptionBillingRunFn);

  const data = useQuery({ queryKey: ["subscriptions"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["subscriptions"] });

  const action = useMutation({
    mutationFn: (vars: { id: string; action: "pause" | "resume" | "cancel" | "cancel_at_period_end" }) =>
      act({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Subscription updated");
    },
    onError: () => toast.error("That change could not be saved"),
  });

  const billing = useMutation({
    mutationFn: () => run(),
    onSuccess: (res) => {
      invalidate();
      const r = res as { claimed?: number; paid?: number; failed?: number };
      toast.success(`${r.claimed ?? 0} due · ${r.paid ?? 0} settled · ${r.failed ?? 0} awaiting payment`);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "The billing run could not start"),
  });

  const subscriptions = data.data?.subscriptions ?? [];
  const charges = data.data?.charges ?? [];

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            Recurring plans and the charges behind them. A billing run only picks up cycles that are actually
            due and marks each one with its own key, so running it twice never bills a customer twice.
          </p>
        </div>
        <button
          type="button"
          disabled={billing.isPending}
          onClick={() => billing.mutate()}
          className="inline-flex min-h-10 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {billing.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <PlayCircle className="size-4" aria-hidden />
          )}
          Run billing now
        </button>
      </header>

      <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Customer subscriptions</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-3">Customer</th>
              <th scope="col" className="p-3">Plan</th>
              <th scope="col" className="p-3">Amount</th>
              <th scope="col" className="p-3">Next charge</th>
              <th scope="col" className="p-3">Status</th>
              <th scope="col" className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">Loading…</td>
              </tr>
            ) : !subscriptions.length ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">No subscriptions yet.</td>
              </tr>
            ) : (
              subscriptions.map((s) => {
                const status = subscriptionStatusLabel(s.status);
                const dunning = dunningPlan(Number(s.failure_count ?? 0));
                return (
                  <tr key={s.id}>
                    <td className="p-3">
                      {s.customers?.name ?? "—"}
                      <span className="block text-xs text-muted-foreground">{s.customers?.email ?? ""}</span>
                    </td>
                    <td className="p-3">
                      {s.product_variants?.name ?? "—"}
                      <span className="money block text-xs text-muted-foreground">
                        every {s.interval_count} {s.interval_unit}
                      </span>
                    </td>
                    <td className="money p-3 font-semibold">
                      {fmtMinor(Number(s.unit_price_minor_int), s.currency_code)}
                    </td>
                    <td className="money p-3 text-xs">
                      {s.next_charge_at ? new Date(s.next_charge_at).toLocaleDateString("en-BD") : "—"}
                      {Number(s.failure_count ?? 0) > 0 ? (
                        <span className="block text-danger-foreground">
                          {dunning.pastDue
                            ? "retries exhausted"
                            : `retry in ${dunning.retryInDays} day(s)`}
                        </span>
                      ) : null}
                    </td>
                    <td className={`p-3 text-xs font-medium ${status.tone}`}>{status.label}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.status === "paused" ? (
                          <button
                            type="button"
                            onClick={() => action.mutate({ id: s.id, action: "resume" })}
                            className="min-h-9 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                          >
                            Resume
                          </button>
                        ) : s.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => action.mutate({ id: s.id, action: "pause" })}
                            className="min-h-9 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                          >
                            Pause
                          </button>
                        ) : null}
                        {s.status !== "cancelled" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => action.mutate({ id: s.id, action: "cancel_at_period_end" })}
                              className="min-h-9 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                            >
                              End at period
                            </button>
                            <button
                              type="button"
                              onClick={() => action.mutate({ id: s.id, action: "cancel" })}
                              className="min-h-9 rounded-fq-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                            >
                              Cancel now
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-fq-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Recent charges</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {charges.slice(0, 30).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="money">
                {fmtMinor(Number(c.amount_minor_int), c.currency_code)}
                <span className="ml-2 text-xs text-muted-foreground">
                  cycle {c.cycle_number} ·{" "}
                  {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString("en-BD") : "—"}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${CHARGE_TONE[c.state] ?? ""}`}>
                {c.state}
                {c.failure_reason ? ` · ${c.failure_reason}` : ""}
              </span>
            </li>
          ))}
          {!charges.length ? <li className="py-2 text-muted-foreground">No charges recorded yet.</li> : null}
        </ul>
      </div>
    </section>
  );
}
