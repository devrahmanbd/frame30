import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusPill, Field, inputClass, btnPrimary } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import {
  loadPayments,
  stepRefund,
  clearCod,
  uploadSettlement,
  postSettlementFile,
  resolveAlert,
} from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  loader: () => loadPayments(),
  head: () => ({
    meta: [
      { title: "Payments desk — Framique admin" },
      {
        name: "description",
        content: "Charge attempts, refunds, cash-on-delivery reconcile and provider settlement matching.",
      },
      { property: "og:title", content: "Payments desk — Framique admin" },
      { property: "og:description", content: "Track every taka from charge attempt to settled payout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsDesk,
  errorComponent: ({ error }) => (
    <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
      {error.message}
    </p>
  ),
});

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const INTENT_TONE: Record<string, Tone> = {
  initiated: "neutral",
  pending: "info",
  paid: "success",
  failed: "danger",
  expired: "warning",
  cancelled: "neutral",
};

const REFUND_TONE: Record<string, Tone> = {
  requested: "neutral",
  approved: "info",
  processing: "info",
  settled: "success",
  failed: "danger",
  declined: "warning",
};

const FILE_TONE: Record<string, Tone> = {
  received: "neutral",
  parsed: "info",
  variance_hold: "warning",
  matched: "info",
  posted: "success",
  rejected: "danger",
  partial: "warning",
};

/** Only forward moves a human can make; the database rejects anything else. */
const REFUND_NEXT: Record<string, ReadonlyArray<"approved" | "processing" | "settled" | "failed" | "declined">> = {
  requested: ["approved", "declined"],
  approved: ["processing", "declined"],
  processing: ["settled", "failed"],
};

const TABS = [
  { id: "intents", en: "Charge attempts", bn: "চার্জ অ্যাটেম্পট" },
  { id: "refunds", en: "Refunds", bn: "রিফান্ড" },
  { id: "cod", en: "COD reconcile", bn: "COD মিলকরণ" },
  { id: "settlement", en: "Settlement", bn: "সেটলমেন্ট" },
] as const;

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-fq-md border border-border bg-card">{children}</div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{children}</th>;
}

function Td({ children, money }: { children: React.ReactNode; money?: boolean }) {
  return <td className={`px-3 py-2 align-middle ${money ? "money text-right" : ""}`}>{children}</td>;
}

function Empty({ label }: { label: string }) {
  return <p className="px-3 py-6 text-sm text-muted-foreground">{label}</p>;
}

function PaymentsDesk() {
  const { t } = useLang();
  const data = Route.useLoaderData();
  const router = useRouter();
  const advance = useServerFn(stepRefund);
  const clear = useServerFn(clearCod);
  const upload = useServerFn(uploadSettlement);
  const post = useServerFn(postSettlementFile);
  const resolve = useServerFn(resolveAlert);

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("intents");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<"bkash" | "nagad" | "rocket" | "bank">("bkash");
  const [fileDate, setFileDate] = useState(new Date().toISOString().slice(0, 10));
  const [csv, setCsv] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const unresolved = data.alerts.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Payments desk", "পেমেন্ট ডেস্ক")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Every taka from charge attempt to settled payout. Amounts are integer minor units and never change once recorded.",
            "চার্জ অ্যাটেম্পট থেকে সেটলড পেআউট পর্যন্ত প্রতিটি টাকা। অঙ্ক পূর্ণসংখ্যায় রাখা হয় এবং একবার লেখা হলে বদলায় না।",
          )}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-fq-md border border-success bg-success-soft px-3 py-2 text-sm">
          {message}
        </p>
      )}

      {unresolved > 0 && (
        <section className="rounded-fq-md border border-warning-foreground/30 bg-warning-soft p-4">
          <h2 className="text-sm font-semibold text-warning-foreground">
            {t("Settlement variances need a decision", "সেটলমেন্ট গরমিলের সিদ্ধান্ত দরকার")} ({unresolved})
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="money">
                  {a.kind} — {t("expected", "প্রত্যাশিত")} {fmtMinor(Number(a.expected_minor_int), "BDT")},{" "}
                  {t("actual", "প্রকৃত")} {fmtMinor(Number(a.actual_minor_int), "BDT")}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => resolve({ data: { alertId: a.id, note: "Reviewed on the payments desk" } }),
                      t("Variance resolved", "গরমিল নিষ্পত্তি হয়েছে"),
                    )
                  }
                  className="min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm"
                >
                  {t("Mark reviewed", "রিভিউ করা হয়েছে")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tablist" aria-label={t("Payment views", "পেমেন্ট ভিউ")} className="flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            type="button"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`min-h-11 rounded-fq-md border px-4 text-sm font-medium ${
              tab === tb.id ? "border-primary bg-info-soft text-info-foreground" : "border-border bg-card"
            }`}
          >
            {t(tb.en, tb.bn)}
          </button>
        ))}
      </div>

      {tab === "intents" && (
        <Card>
          {data.intents.length === 0 ? (
            <Empty label={t("No charge attempts yet.", "এখনও কোনো চার্জ অ্যাটেম্পট নেই।")} />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{t("Charge attempts", "চার্জ অ্যাটেম্পট")}</caption>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <Th>{t("Method", "মেথড")}</Th>
                  <Th>{t("Attempt", "অ্যাটেম্পট")}</Th>
                  <Th>{t("Status", "স্ট্যাটাস")}</Th>
                  <Th>{t("Reference", "রেফারেন্স")}</Th>
                  <Th>{t("Amount", "পরিমাণ")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.intents.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <Td>{i.method}</Td>
                    <Td>#{i.attempt}</Td>
                    <Td>
                      <StatusPill tone={INTENT_TONE[i.status] ?? "neutral"} label={i.status} />
                    </Td>
                    <Td>{i.provider_reference ?? "—"}</Td>
                    <Td money>{fmtMinor(Number(i.amount_minor_int), i.currency_code)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "refunds" && (
        <Card>
          {data.refunds.length === 0 ? (
            <Empty label={t("No refunds requested.", "কোনো রিফান্ড অনুরোধ নেই।")} />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{t("Refunds", "রিফান্ড")}</caption>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <Th>{t("Status", "স্ট্যাটাস")}</Th>
                  <Th>{t("Reason", "কারণ")}</Th>
                  <Th>{t("Amount", "পরিমাণ")}</Th>
                  <Th>{t("Next step", "পরের ধাপ")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.refunds.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <Td>
                      <StatusPill tone={REFUND_TONE[r.status] ?? "neutral"} label={r.status} />
                    </Td>
                    <Td>{r.reason}</Td>
                    <Td money>{fmtMinor(Number(r.amount_minor_int), r.currency_code)}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-2">
                        {(REFUND_NEXT[r.status] ?? []).map((to) => (
                          <button
                            key={to}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => advance({ data: { refundId: r.id, to } }),
                                t(`Refund moved to ${to}`, `রিফান্ড ${to} হয়েছে`),
                              )
                            }
                            className="min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm"
                          >
                            {to}
                          </button>
                        ))}
                        {(REFUND_NEXT[r.status] ?? []).length === 0 && (
                          <span className="text-muted-foreground">{t("Closed", "সম্পন্ন")}</span>
                        )}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "cod" && (
        <Card>
          {data.cod.length === 0 ? (
            <Empty label={t("No cash-on-delivery collections recorded.", "কোনো COD সংগ্রহ লেখা হয়নি।")} />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{t("COD reconcile", "COD মিলকরণ")}</caption>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <Th>{t("Carrier", "কুরিয়ার")}</Th>
                  <Th>{t("Expected", "প্রত্যাশিত")}</Th>
                  <Th>{t("Collected", "সংগৃহীত")}</Th>
                  <Th>{t("Variance", "গরমিল")}</Th>
                  <Th>{t("Status", "স্ট্যাটাস")}</Th>
                  <Th>{t("Action", "অ্যাকশন")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.cod.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <Td>{c.carrier_code ?? "—"}</Td>
                    <Td money>{fmtMinor(Number(c.expected_minor_int), "BDT")}</Td>
                    <Td money>{fmtMinor(Number(c.collected_minor_int), "BDT")}</Td>
                    <Td money>{fmtMinor(Number(c.variance_minor_int), "BDT")}</Td>
                    <Td>
                      <StatusPill
                        tone={c.status === "matched" ? "success" : c.status === "cleared" ? "info" : "warning"}
                        label={c.status}
                      />
                    </Td>
                    <Td>
                      {c.status === "variance" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => clear({ data: { reconId: c.id, note: "Cleared after courier confirmation" } }),
                              t("Variance cleared", "গরমিল নিষ্পত্তি হয়েছে"),
                            )
                          }
                          className="min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm"
                        >
                          {t("Clear", "নিষ্পত্তি")}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "settlement" && (
        <div className="space-y-4">
          <form
            className="grid gap-3 rounded-fq-md border border-border bg-card p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => upload({ data: { provider, fileDate, csv } }),
                t("Settlement file ingested", "সেটলমেন্ট ফাইল নেওয়া হয়েছে"),
              );
            }}
          >
            <Field label={t("Provider", "প্রোভাইডার")}>
              <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
                <option value="bank">Bank</option>
              </select>
            </Field>
            <Field label={t("File date", "ফাইলের তারিখ")}>
              <input type="date" className={inputClass} value={fileDate} onChange={(e) => setFileDate(e.target.value)} required />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t("Feed rows (ref,gross,fee,net in minor units)", "ফিড রো (ref,gross,fee,net — পয়সায়)")}
              >
                <textarea
                  className={`${inputClass} min-h-32 font-mono`}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={"ref,gross,fee,net\nbkash:abc123,120000,2400,117600"}
                  required
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? t("Working…", "চলছে…") : t("Ingest file", "ফাইল নাও")}
              </button>
            </div>
          </form>

          <Card>
            {data.files.length === 0 ? (
              <Empty label={t("No settlement files yet.", "এখনও কোনো সেটলমেন্ট ফাইল নেই।")} />
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">{t("Settlement files", "সেটলমেন্ট ফাইল")}</caption>
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <Th>{t("Provider", "প্রোভাইডার")}</Th>
                    <Th>{t("Date", "তারিখ")}</Th>
                    <Th>{t("Matched", "মিলেছে")}</Th>
                    <Th>{t("Net", "নেট")}</Th>
                    <Th>{t("Status", "স্ট্যাটাস")}</Th>
                    <Th>{t("Action", "অ্যাকশন")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.files.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <Td>{f.provider}</Td>
                      <Td>{f.file_date}</Td>
                      <Td>
                        {f.matched_count}/{f.item_count}
                      </Td>
                      <Td money>{fmtMinor(Number(f.net_minor_int), "BDT")}</Td>
                      <Td>
                        <StatusPill tone={FILE_TONE[f.status] ?? "neutral"} label={f.status} />
                      </Td>
                      <Td>
                        {f.status === "matched" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => post({ data: { fileId: f.id } }),
                                t("Settlement posted to the ledger", "সেটলমেন্ট লেজারে পোস্ট হয়েছে"),
                              )
                            }
                            className="min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm"
                          >
                            {t("Post to ledger", "লেজারে পোস্ট")}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{f.reject_reason ?? "—"}</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
