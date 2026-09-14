import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  StatusPill,
  Money,
  Field,
  ErrorFrame,
  inputClass,
  btnPrimary,
  btnGhost,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { returnsLoadFn, returnAdvanceFn, disputeAdvanceFn } from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/returns")({
  head: () => ({
    meta: [
      { title: "Returns & disputes — Framique admin" },
      {
        name: "description",
        content:
          "Approve, receive and refund returns, and answer payment disputes with a full audited timeline for every step.",
      },
      { property: "og:title", content: "Returns & disputes — Framique admin" },
      {
        property: "og:description",
        content: "One desk for return requests, restocking and chargeback evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReturnsPage,
});

const KEY = ["commerce", "returns"] as const;

const RETURN_NEXT: Record<string, ("approved" | "rejected" | "received" | "refunded" | "cancelled")[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["received", "cancelled"],
  received: ["refunded"],
  refunded: [],
  rejected: [],
  cancelled: [],
};

const DISPUTE_NEXT: Record<string, ("evidence_submitted" | "won" | "lost" | "withdrawn")[]> = {
  open: ["evidence_submitted", "withdrawn"],
  evidence_submitted: ["won", "lost"],
  won: [],
  lost: [],
  withdrawn: [],
};

const TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  requested: "warning",
  approved: "info",
  received: "info",
  refunded: "success",
  rejected: "danger",
  cancelled: "neutral",
  open: "warning",
  evidence_submitted: "info",
  won: "success",
  lost: "danger",
  withdrawn: "neutral",
};

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function ReturnsPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(returnsLoadFn);
  const advanceReturn = useServerFn(returnAdvanceFn);
  const advanceDispute = useServerFn(disputeAdvanceFn);
  const [tab, setTab] = useState<"returns" | "disputes">("returns");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });

  const returnMutation = useMutation({
    mutationFn: (v: { returnId: string; status: "approved" | "rejected" | "received" | "refunded" | "cancelled" }) =>
      advanceReturn({ data: { ...v, note: note || null } }),
    onSuccess: () => {
      setError(null);
      setNote("");
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const disputeMutation = useMutation({
    mutationFn: (v: { disputeId: string; status: "evidence_submitted" | "won" | "lost" | "withdrawn" }) =>
      advanceDispute({ data: { ...v, note: note || null } }),
    onSuccess: () => {
      setError(null);
      setNote("");
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const returns = data?.returns ?? [];
  const disputes = data?.disputes ?? [];
  const openReturns = returns.filter((r) => r.status === "requested").length;
  const openDisputes = disputes.filter((d) => d.status === "open").length;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Returns & disputes", "রিটার্ন ও ডিসপিউট")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Each step is checked server-side; refunds go through the ledger, never a direct edit.",
            "প্রতিটি ধাপ সার্ভারে যাচাই হয়; রিফান্ড সবসময় লেজারের মাধ্যমে হয়।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Awaiting review", "রিভিউ বাকি")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{openReturns}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Open disputes", "খোলা ডিসপিউট")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{openDisputes}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Refunded", "রিফান্ড হয়েছে")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">
            {returns.filter((r) => r.status === "refunded").length}
          </dd>
        </div>
      </dl>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />

      <div role="tablist" aria-label="Returns views" className="flex gap-2">
        {([
          ["returns", t("Returns", "রিটার্ন")],
          ["disputes", t("Disputes", "ডিসপিউট")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={tab === id ? btnPrimary : btnGhost}
          >
            {label}
          </button>
        ))}
      </div>

      <Field
        label={t("Note for the next action", "পরবর্তী ধাপের নোট")}
        hint={t("Stored on the audit timeline.", "অডিট টাইমলাইনে সংরক্ষিত হয়।")}
      >
        <input
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </Field>

      {isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}

      {tab === "returns" && !isLoading && (
        <ul className="space-y-3">
          {returns.map((r) => {
            const order = r.orders as { order_number?: string; customer_name?: string } | null;
            const items = (r.return_items ?? []) as { id: string; quantity: number }[];
            return (
              <li key={r.id} className="rounded-fq-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {order?.order_number ?? r.order_id.slice(0, 8)}{" "}
                      <span className="text-sm text-muted-foreground">
                        {order?.customer_name ?? ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{r.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill label={r.status} tone={TONE[r.status] ?? "neutral"} />
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {items.reduce((s, i) => s + i.quantity, 0)} {t("items", "আইটেম")}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(RETURN_NEXT[r.status] ?? []).map((next) => (
                    <button
                      key={next}
                      type="button"
                      className={btnGhost}
                      disabled={returnMutation.isPending}
                      onClick={() => returnMutation.mutate({ returnId: r.id, status: next })}
                    >
                      {next}
                    </button>
                  ))}
                  {(RETURN_NEXT[r.status] ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("Closed — no further steps.", "সম্পন্ন — আর কোনো ধাপ নেই।")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {returns.length === 0 && (
            <li className="rounded-fq-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("No return requests yet.", "এখনো কোনো রিটার্ন অনুরোধ নেই।")}
            </li>
          )}
        </ul>
      )}

      {tab === "disputes" && !isLoading && (
        <ul className="space-y-3">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-fq-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium tabular-nums">{d.reference}</p>
                  <p className="text-sm text-muted-foreground">{d.reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Money minor={Number(d.amount_minor_int)} className="font-medium" />
                  <StatusPill label={d.status} tone={TONE[d.status] ?? "neutral"} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(DISPUTE_NEXT[d.status] ?? []).map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={btnGhost}
                    disabled={disputeMutation.isPending}
                    onClick={() => disputeMutation.mutate({ disputeId: d.id, status: next })}
                  >
                    {next.replace("_", " ")}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {disputes.length === 0 && (
            <li className="rounded-fq-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("No disputes. Good news.", "কোনো ডিসপিউট নেই।")}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
