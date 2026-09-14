/**
 * Platform collection desk — the screen where a merchant pays *us*.
 *
 * Rules this component obeys, because getting them wrong costs real money:
 *
 *  1. **It never decides.** Every button state comes from the server's
 *     `CollectionVerdict`. The UI cannot offer a retry the server would refuse,
 *     and cannot hide one it would allow.
 *  2. **One attempt at a time.** While a charge is live the only choices are
 *     "resume" and "cancel", so a merchant cannot open two wallet sessions and
 *     pay the same invoice twice.
 *  3. **Idempotent starts.** Each attempt carries a client-generated
 *     idempotency key; a double click, a flaky network retry, or a back-button
 *     replay returns the same charge instead of opening a second one.
 *  4. **The return is read, not trusted.** The signed return route redirects
 *     here with an outcome in the query string; we surface it, then refetch the
 *     authoritative state from the server before rendering anything final.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  platformCancelChargeFn,
  platformCollectionFn,
  platformStartChargeFn,
} from "@/lib/platform-billing.functions";
import { methodLabel, type CollectionVerdict } from "@/lib/platform-billing";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

type Desk = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof platformCollectionFn>>>>;
type Item = Desk["items"][number];

const STATUS_CLS: Record<string, string> = {
  paid: "bg-success/15 text-success",
  open: "bg-warning/15 text-warning",
  past_due: "bg-destructive/15 text-destructive",
  void: "bg-muted text-muted-foreground",
};

function day(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

/** Parses the `code|en|bn` wire error the RPCs throw; falls back to a safe line. */
function readError(error: unknown, bn: boolean) {
  const message = error instanceof Error ? error.message : "";
  const parts = message.split("|");
  if (parts.length >= 3) return bn ? parts[2]! : parts[1]!;
  return bn
    ? "পেমেন্ট এখন সম্ভব নয়। আপনার ইনভয়েস অপরিবর্তিত আছে।"
    : "Payment is not possible right now. Your invoice is unchanged.";
}

function newIdempotencyKey() {
  const c = globalThis.crypto;
  return c && "randomUUID" in c ? c.randomUUID() : `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function CollectionDesk() {
  const { t, lang } = useLang();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const load = useServerFn(platformCollectionFn);
  const start = useServerFn(platformStartChargeFn);
  const cancel = useServerFn(platformCancelChargeFn);

  const [picking, setPicking] = useState<string | null>(null);
  const [manual, setManual] = useState<{ en: string; bn: string; reference: string } | null>(null);
  const keys = useRef(new Map<string, string>());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["platform-collection"],
    queryFn: () => load(),
    // A live charge expires on a clock; the verdict must not go stale on screen.
    refetchInterval: (q) =>
      (q.state.data as Desk | undefined)?.items.some((i) => i.live) ? 15_000 : false,
    staleTime: 5_000,
    retry: 1,
  });

  // The signed return route lands here with the outcome in the query string.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("pay");
    const failed = params.get("pay_error");
    if (!paid && !failed) return;
    if (paid === "paid") {
      const receipt = params.get("receipt");
      toast.success(
        receipt
          ? t(`Payment received. Receipt ${receipt}.`, `পেমেন্ট গৃহীত। রসিদ ${receipt}।`)
          : t("Payment received.", "পেমেন্ট গৃহীত।"),
      );
    } else if (paid) {
      toast.error(
        t(`Payment did not complete (${paid}).`, `পেমেন্ট সম্পন্ন হয়নি (${paid})।`),
      );
    } else if (failed) {
      toast.error(t(`Payment could not be verified (${failed}).`, `পেমেন্ট যাচাই করা যায়নি (${failed})।`));
    }
    // Clear the params so a refresh does not replay the toast, then re-read the
    // authoritative state rather than believing the query string.
    window.history.replaceState({}, "", window.location.pathname);
    void refetch();
  }, [refetch, t]);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["platform-collection"] });
    void qc.invalidateQueries({ queryKey: ["billing"] });
    void qc.invalidateQueries({ queryKey: ["entitlements"] });
  }, [qc]);

  const startMutation = useMutation({
    mutationFn: ({ invoiceId, method }: { invoiceId: string; method: string }) => {
      const existing = keys.current.get(`${invoiceId}:${method}`) ?? newIdempotencyKey();
      keys.current.set(`${invoiceId}:${method}`, existing);
      return start({ data: { invoiceId, method, idempotencyKey: existing } });
    },
    onSuccess: (result) => {
      setPicking(null);
      if (result.redirectUrl) {
        // Full-page navigation: wallet pages routinely refuse to be framed.
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.instructions) {
        setManual({ ...result.instructions, reference: result.chargeId.slice(0, 8).toUpperCase() });
      }
      invalidate();
    },
    onError: (error: unknown) => {
      // The key is burned on a hard failure so the next attempt is a real one.
      keys.current.clear();
      toast.error(readError(error, bn));
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (chargeId: string) => cancel({ data: { chargeId } }),
    onSuccess: () => {
      keys.current.clear();
      toast.success(t("Attempt cancelled.", "চেষ্টা বাতিল হয়েছে।"));
      invalidate();
    },
    onError: (error: unknown) => toast.error(readError(error, bn)),
  });

  const outstanding = data?.outstandingMinorInt ?? 0;
  const currency = data?.items[0]?.invoice.currency_code ?? "BDT";
  const busy = startMutation.isPending || cancelMutation.isPending;

  const dunning = useMemo(() => {
    if (!data) return null;
    const s = data.subscription;
    if (s.status === "active" || s.status === "trialing") return null;
    return s;
  }, [data]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Loading invoices…", "ইনভয়েস লোড হচ্ছে…")}</p>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-fq-md border border-border bg-card p-4">
        <p className="text-sm">
          {t(
            "We could not load your invoices just now. No payment has been taken.",
            "এই মুহূর্তে আপনার ইনভয়েস লোড করা যায়নি। কোনো টাকা কাটা হয়নি।",
          )}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 min-h-9 rounded-fq-md border border-border px-3 text-xs font-medium"
        >
          {t("Try again", "আবার চেষ্টা করুন")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dunning && (
        <div className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">
            {t("Subscription needs attention", "সাবস্ক্রিপশনে মনোযোগ দরকার")} · {dunning.status}
            {dunning.dunningStage > 0 && ` · ${t("stage", "ধাপ")} ${dunning.dunningStage}`}
          </p>
          <p className="mt-1 text-muted-foreground">
            {dunning.pastDueDays != null
              ? t(
                  `Outstanding for ${dunning.pastDueDays} day(s). Settling any open invoice restores full service immediately.`,
                  `${dunning.pastDueDays} দিন বকেয়া। যেকোনো বকেয়া ইনভয়েস পরিশোধ করলেই সেবা সাথে সাথে ফিরে আসবে।`,
                )
              : t(
                  "Settling the open invoice restores full service immediately.",
                  "বকেয়া ইনভয়েস পরিশোধ করলেই সেবা সাথে সাথে ফিরে আসবে।",
                )}
            {dunning.graceUntil && ` · ${t("grace until", "গ্রেস")} ${day(dunning.graceUntil)}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-fq-md border border-border bg-card p-3">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{t("Outstanding", "বকেয়া")}</p>
          <p className="text-xl font-semibold tabular-nums">{fmtMinor(outstanding, currency)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Payments are taken on the provider's own page. We never see or store card or PIN details.",
            "পেমেন্ট প্রোভাইডারের নিজস্ব পেজে সম্পন্ন হয়। কার্ড বা পিন আমরা কখনো দেখি বা সংরক্ষণ করি না।",
          )}
        </p>
      </div>

      {manual && (
        <div className="rounded-fq-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{t("Bank transfer instructions", "ব্যাংক ট্রান্সফার নির্দেশনা")}</p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{bn ? manual.bn : manual.en}</p>
          <p className="mt-1">
            {t("Reference", "রেফারেন্স")}: <code className="font-mono">{manual.reference}</code>
          </p>
          <button type="button" onClick={() => setManual(null)} className="mt-2 text-xs underline">
            {t("Dismiss", "বন্ধ করুন")}
          </button>
        </div>
      )}

      {data.items.length === 0 && (
        <p className="rounded-fq-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("No invoices yet.", "কোনো ইনভয়েস নেই।")}
        </p>
      )}

      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.invoice.id} className="rounded-fq-md border border-border bg-card p-4">
            <InvoiceRow
              item={item}
              bn={bn}
              busy={busy}
              methods={data.methods}
              picking={picking === item.invoice.id}
              onPick={() => setPicking(picking === item.invoice.id ? null : item.invoice.id)}
              onStart={(method) => startMutation.mutate({ invoiceId: item.invoice.id, method })}
              onCancel={(chargeId) => cancelMutation.mutate(chargeId)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function verdictTone(kind: CollectionVerdict["kind"]) {
  if (kind === "settled") return "text-success";
  if (kind === "support" || kind === "not_chargeable") return "text-destructive";
  if (kind === "wait") return "text-warning";
  return "text-muted-foreground";
}

function InvoiceRow({
  item,
  bn,
  busy,
  methods,
  picking,
  onPick,
  onStart,
  onCancel,
}: {
  item: Item;
  bn: boolean;
  busy: boolean;
  methods: Desk["methods"];
  picking: boolean;
  onPick: () => void;
  onStart: (method: string) => void;
  onCancel: (chargeId: string) => void;
}) {
  const { t } = useLang();
  const inv = item.invoice;
  const verdict = item.verdict;
  const statusCls = STATUS_CLS[inv.status] ?? STATUS_CLS["open"]!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</p>
          <p className="text-lg font-semibold tabular-nums">
            {fmtMinor(Number(inv.total_minor_int), inv.currency_code)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {day(inv.period_start)} → {day(inv.period_end)} ·{" "}
            {t("VAT", "ভ্যাট")} {fmtMinor(Number(inv.vat_minor_int), inv.currency_code)} (
            {inv.vat_rate_basis_points / 100}%)
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusCls}`}>{inv.status}</span>
      </div>

      <p className={`text-sm ${verdictTone(verdict.kind)}`}>{bn ? verdict.bn : verdict.en}</p>

      {verdict.kind === "collect" && verdict.attemptsLeft <= 2 && (
        <p className="text-xs text-warning">
          {t(
            `${verdict.attemptsLeft} self-serve attempt(s) left before our team takes over.`,
            `নিজে চেষ্টা করার ${verdict.attemptsLeft}টি সুযোগ বাকি, এরপর আমাদের টিম দেখবে।`,
          )}
        </p>
      )}

      {verdict.kind === "resume" && item.live && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onStart(item.live!.method)}
            className="min-h-9 rounded-fq-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {t(`Resume ${methodLabel(item.live.method)}`, `${methodLabel(item.live.method)} চালিয়ে যান`)}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(item.live!.id)}
            className="min-h-9 rounded-fq-md border border-border px-3 text-xs font-medium disabled:opacity-50"
          >
            {t("Cancel attempt", "চেষ্টা বাতিল")}
          </button>
        </div>
      )}

      {verdict.kind === "collect" && (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={onPick}
            aria-expanded={picking}
            className="min-h-9 rounded-fq-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {picking ? t("Close", "বন্ধ") : t("Pay invoice", "ইনভয়েস পরিশোধ")}
          </button>
          {picking && (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <li key={m.key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onStart(m.key)}
                    className="w-full rounded-fq-md border border-border p-2 text-left text-xs hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span className="block font-medium">{bn ? m.labelBn : m.label}</span>
                    <span className="block text-muted-foreground">{bn ? m.noteBn : m.noteEn}</span>
                    {m.manualSettlement && (
                      <span className="mt-1 block text-warning">
                        {t("Clears after we confirm receipt.", "প্রাপ্তি নিশ্চিত হলে পরিশোধিত হবে।")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {verdict.kind === "support" && (
        <Link to="/admin/support" className="inline-block text-xs underline">
          {t("Contact support with this invoice number", "এই ইনভয়েস নম্বর নিয়ে সাপোর্টে যোগাযোগ করুন")}
        </Link>
      )}

      {item.receipt && (
        <details className="rounded-fq-md bg-muted/30 p-2">
          <summary className="cursor-pointer text-xs font-medium">{t("Receipt", "রসিদ")}</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {item.receipt.map((line) => (
              <div key={line.label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{bn ? line.labelBn : line.label}</dt>
                <dd className="tabular-nums">{line.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {item.history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t(`Attempt history (${item.history.length})`, `চেষ্টার ইতিহাস (${item.history.length})`)}
          </summary>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {item.history.map((c) => (
              <li key={c.id} className="tabular-nums">
                {c.created_at.slice(0, 16).replace("T", " ")} · {methodLabel(c.method)} · {c.status}
                {c.failure_code ? ` · ${c.failure_code}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}