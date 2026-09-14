import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import {
  fraudDeskFn,
  fraudScanFn,
  fraudDecideFn,
  fraudRuleFn,
  fraudBlacklistAddFn,
  fraudBlacklistToggleFn,
} from "@/lib/fraud.functions";

export const Route = createFileRoute("/_authenticated/admin/fraud/")({
  loader: () => fraudDeskFn(),
  head: () => ({
    meta: [
      { title: "ফ্রড ও রিস্ক ডেস্ক — Framique admin" },
      { name: "description", content: "Review flagged orders, risk rules and blacklist entries." },
      { property: "og:title", content: "ফ্রড ও রিস্ক ডেস্ক — Framique admin" },
      { property: "og:description", content: "Risk review queue, rules and blacklist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FraudDesk,
});

const STATUS_LABEL: Record<string, { en: string; bn: string }> = {
  open: { en: "Awaiting review", bn: "পর্যালোচনার অপেক্ষায়" },
  evidence_requested: { en: "Evidence requested", bn: "প্রমাণ চাওয়া হয়েছে" },
  approved: { en: "Approved", bn: "অনুমোদিত" },
  rejected: { en: "Rejection recommended", bn: "বাতিল সুপারিশ" },
};

function riskTone(score: number) {
  if (score > 70) return "bg-destructive/10 text-destructive";
  if (score >= 40) return "bg-warning/15 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-fq-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FraudDesk() {
  const desk = Route.useLoaderData();
  const router = useRouter();
  const { t } = useLang();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cases = useMemo(
    () =>
      desk.cases.filter(
        (c) =>
          (statusFilter === "all" || c.status === statusFilter) &&
          (!search.trim() ||
            c.order_number.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [desk.cases, statusFilter, search],
  );

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-bangla-display text-xl font-semibold">
              {t("Fraud & Risk Desk", "ফ্রড ও রিস্ক ডেস্ক")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "The system only flags — it never cancels or refunds an order on its own.",
                "সিস্টেম শুধু ফ্ল্যাগ করে — অর্ডার বাতিল বা রিফান্ড কখনো নিজে করে না।",
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/admin/fraud/audit"
              className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm"
            >
              {t("Audit trail", "অডিট ট্রেইল")}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => fraudScanFn(), t("Scan complete", "স্ক্যান সম্পন্ন"))}
              className="min-h-11 rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t("Run risk scan", "রিস্ক স্ক্যান চালান")}
            </button>
          </div>
        </header>

        {msg && (
          <p role="status" className="rounded-fq-md border border-border bg-muted p-3 text-sm">
            {msg}
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi label={t("Awaiting review", "পর্যালোচনার অপেক্ষায়")} value={desk.counts.pending} />
          <Kpi label={t("Flagged orders", "ফ্ল্যাগড অর্ডার")} value={desk.counts.flagged} />
          <Kpi label={t("Auto-blocked", "স্বয়ংক্রিয় ব্লক")} value={desk.counts.blocked} />
          <Kpi label={t("Sent to review", "রিভিউতে পাঠানো")} value={desk.counts.reviewed} />
          <Kpi label={t("Failed payments", "ব্যর্থ পেমেন্ট")} value={desk.counts.failedPayments} />
          <Kpi label={t("Blacklisted", "ব্ল্যাকলিস্টেড")} value={desk.counts.blacklisted} />
        </section>


        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor="fraud-status">
              {t("Status", "স্ট্যাটাস")}
            </label>
            <select
              id="fraud-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-11 rounded-fq-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">{t("All", "সব")}</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v.en, v.bn)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search order number", "অর্ডার নম্বর খুঁজুন")}
              aria-label={t("Search order number", "অর্ডার নম্বর খুঁজুন")}
              className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
            />
          </div>

          {cases.length === 0 && (
            <p className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              {t("No cases match this filter.", "এই ফিল্টারে কোনো কেস নেই।")}
            </p>
          )}

          <ul className="space-y-3">
            {cases.map((c) => {
              const signals = (c.signals ?? []) as Array<{
                code: string;
                label?: string;
                detail?: string;
                weight?: number;
                observed?: number;
                threshold?: number | null;
              }>;
              const decided = c.status === "approved" || c.status === "rejected";
              const held = c.status === "open" || c.status === "evidence_requested";
              return (
                <li key={c.id} className="rounded-fq-md border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">#{c.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.customer_phone_masked} ·{" "}
                        <span className="tabular-nums">
                          {fmtMinor(c.amount_minor_int, c.currency_code)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {held && (
                        <span className="rounded-fq-sm bg-warning/15 px-2 py-1 text-xs font-medium text-warning-foreground">
                          {t("Fulfilment held", "ফুলফিলমেন্ট আটকানো")}
                        </span>
                      )}
                      <span
                        className={`rounded-fq-sm px-2 py-1 text-xs font-medium tabular-nums ${riskTone(c.risk_score)}`}
                      >
                        {t("Risk", "রিস্ক")} {c.risk_score}/100
                      </span>
                      <span className="rounded-fq-sm border border-border px-2 py-1 text-xs">
                        {STATUS_LABEL[c.status] ? t(STATUS_LABEL[c.status].en, STATUS_LABEL[c.status].bn) : c.status}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {signals.map((s) => (
                      <li
                        key={s.code}
                        className="flex flex-wrap items-center gap-2 rounded-fq-sm bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">{s.code}</span>
                        <span>{s.detail ?? s.label}</span>
                        {typeof s.weight === "number" && (
                          <span className="tabular-nums">+{s.weight}</span>
                        )}
                        {typeof s.threshold === "number" && (
                          <span className="tabular-nums">
                            {t("threshold", "থ্রেশহোল্ড")} {s.threshold}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {decided ? (

                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("Decision", "সিদ্ধান্ত")}:{" "}
                      {STATUS_LABEL[c.status] ? t(STATUS_LABEL[c.status].en, STATUS_LABEL[c.status].bn) : c.status} ·{" "}
                      {c.decision_at ? new Date(c.decision_at).toLocaleString("en-GB") : "—"}
                      {c.decision_note ? ` · ${c.decision_note}` : ""}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <input
                        value={note[c.id] ?? ""}
                        onChange={(e) => setNote((n) => ({ ...n, [c.id]: e.target.value }))}
                        placeholder={t("Decision note (kept in audit)", "সিদ্ধান্তের নোট (অডিটে থাকবে)")}
                        aria-label={t(`Note ${c.order_number}`, `নোট ${c.order_number}`)}
                        className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["approved", { en: "Approve", bn: "অনুমোদন" }],
                            ["rejected", { en: "Recommend rejection", bn: "বাতিল সুপারিশ" }],
                            ["evidence_requested", { en: "Request evidence", bn: "প্রমাণ চান" }],
                          ] as const
                        ).map(([decision, label]) => (
                          <button
                            key={decision}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  fraudDecideFn({
                                    data: {
                                      caseId: c.id,
                                      decision,
                                      note: note[c.id]?.trim() || null,
                                    },
                                  }),
                                decision === "rejected"
                                  ? t(
                                      "Rejection recommendation saved — process refund from order page",
                                      "বাতিল সুপারিশ সংরক্ষিত — রিফান্ড অর্ডার পেজ থেকে করুন",
                                    )
                                  : t("Decision saved", "সিদ্ধান্ত সংরক্ষিত"),
                              )
                            }
                            className="min-h-11 rounded-fq-md border border-border px-3 py-2 text-sm disabled:opacity-60"
                          >
                            {t(label.en, label.bn)}
                          </button>
                        ))}
                        {c.order_id && (
                          <Link
                            to="/admin/orders/$orderId"
                            params={{ orderId: c.order_id }}
                            className="min-h-11 rounded-fq-md px-3 py-2 text-sm underline"
                          >
                            {t("View order", "অর্ডার দেখুন")}
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <RulesPanel desk={desk} busy={busy} run={run} />
        <VerdictsPanel desk={desk} />
        <BlacklistPanel desk={desk} busy={busy} run={run} />
      </div>
    </AdminShell>
  );
}

type Desk = Awaited<ReturnType<typeof fraudDeskFn>>;
type Runner = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

function ActionBadge({ action }: { action: string }) {
  const tone =
    action === "block"
      ? "bg-destructive/10 text-destructive"
      : action === "review"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return <span className={`rounded-fq-sm px-2 py-1 text-xs font-medium ${tone}`}>{action}</span>;
}

function VerdictsPanel({ desk }: { desk: Desk }) {
  const { t } = useLang();
  return (
    <section className="space-y-3">
      <h2 className="font-bangla-display text-lg font-semibold">
        {t("Recent checkout verdicts", "সাম্প্রতিক চেকআউট রায়")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Every checkout is scored before stock moves. Blocked attempts never create an order.",
          "প্রতিটি চেকআউট স্টক নড়ার আগে স্কোর হয়। ব্লক হওয়া চেষ্টায় অর্ডার তৈরি হয় না।",
        )}
      </p>
      {desk.assessments.length === 0 ? (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {t("No verdicts recorded yet.", "এখনো কোনো রায় নেই।")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
          {desk.assessments.slice(0, 25).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <ActionBadge action={a.action} />
              <span className="tabular-nums">{a.score}/100</span>
              <span className="text-muted-foreground">{a.decisive_code ?? t("no blocking rule", "ব্লকিং রুল নেই")}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {new Date(a.created_at).toLocaleString("en-GB")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RulesPanel({ desk, busy, run }: { desk: Desk; busy: boolean; run: Runner }) {
  const { t } = useLang();
  const ordered = [...desk.catalog].sort((a, b) => a.precedence - b.precedence);
  return (
    <section className="space-y-3">
      <h2 className="font-bangla-display text-lg font-semibold">{t("Risk rules", "রিস্ক রুল")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Rules run top to bottom. The first blocking rule that fires decides the outcome; the rest add weight to the score.",
          "রুল উপর থেকে নিচে চলে। প্রথম ব্লকিং রুলই সিদ্ধান্ত নেয়; বাকিগুলো স্কোরে যোগ হয়।",
        )}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {ordered.map((def, index) => {
          const row = desk.rules.find((r) => r.code === def.code);
          const params = (row?.params ?? {}) as Record<string, number>;
          const value = def.paramKey ? Number(params[def.paramKey] ?? def.defaults[def.paramKey] ?? 0) : 0;
          return (
            <li key={def.code} className="rounded-fq-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                    {def.title}
                    <ActionBadge action={def.action} />
                  </p>
                  <p className="text-xs text-muted-foreground">{def.hint}</p>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={row?.enabled ?? true}
                    disabled={busy}
                    onChange={(e) =>
                      run(
                        () =>
                          fraudRuleFn({
                            data: { code: def.code, enabled: e.target.checked, params },
                          }),
                        t("Rule updated", "রুল হালনাগাদ"),
                      )
                    }
                  />
                  {t("Enabled", "সক্রিয়")}
                </label>
              </div>
              {def.paramKey && (
                <label className="mt-3 block text-xs text-muted-foreground">
                  {def.paramLabel}
                  <input
                    type="number"
                    min={0}
                    defaultValue={value}
                    disabled={busy}
                    onBlur={(e) =>
                      run(
                        () =>
                          fraudRuleFn({
                            data: {
                              code: def.code,
                              enabled: row?.enabled ?? true,
                              params: { [def.paramKey as string]: Number(e.target.value) || 0 },
                            },
                          }),
                        t("Threshold updated", "থ্রেশহোল্ড হালনাগাদ"),
                      )
                    }
                    className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm tabular-nums text-foreground"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BlacklistPanel({ desk, busy, run }: { desk: Desk; busy: boolean; run: Runner }) {
  const { t } = useLang();
  const [kind, setKind] = useState<"phone" | "email">("phone");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="font-bangla-display text-lg font-semibold">{t("Blacklist", "ব্ল্যাকলিস্ট")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Blocking happens server-side at order placement; this is management only.",
          "ব্লকিং সার্ভারে অর্ডার প্লেসমেন্টের সময় হয়; এখানে শুধু ব্যবস্থাপনা।",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "phone" | "email")}
          aria-label={t("Type", "ধরন")}
          className="min-h-11 rounded-fq-md border border-border bg-background px-2 text-sm"
        >
          <option value="phone">{t("Phone", "ফোন")}</option>
          <option value="email">{t("Email", "ইমেইল")}</option>
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("Value", "মান")}
          aria-label={t("Blacklist value", "ব্ল্যাকলিস্ট মান")}
          className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Reason", "কারণ")}
          aria-label={t("Reason", "কারণ")}
          className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy || value.trim().length < 3}
          onClick={() =>
            run(
              () =>
                fraudBlacklistAddFn({
                  data: { kind, value: value.trim(), reason: reason.trim() || null },
                }),
              t("Added to blacklist", "ব্ল্যাকলিস্টে যোগ হয়েছে"),
            ).then(() => {
              setValue("");
              setReason("");
            })
          }
          className="min-h-11 rounded-fq-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {t("Add", "যোগ করুন")}
        </button>
      </div>
      <ul className="divide-y divide-border rounded-fq-md border border-border bg-card">
        {desk.blacklist.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">{t("No entries.", "কোনো এন্ট্রি নেই।")}</li>
        )}
        {desk.blacklist.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span>
              <span className="font-medium">{b.value}</span>{" "}
              <span className="text-muted-foreground">
                ({b.kind}) {b.reason ?? ""} {b.active ? "" : t("· inactive (whitelisted)", "· নিষ্ক্রিয় (হোয়াইটলিস্টেড)")}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () => fraudBlacklistToggleFn({ data: { id: b.id, active: !b.active } }),
                  t("Updated", "হালনাগাদ হয়েছে"),
                )
              }
              className="min-h-11 rounded-fq-md border border-border px-3 text-sm disabled:opacity-60"
            >
              {b.active ? t("Remove", "সরান") : t("Restore", "ফেরান")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
