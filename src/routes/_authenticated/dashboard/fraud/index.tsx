import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  CheckCircle2,
  XCircle,
  Search,
  UserX,
  Sliders,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  RefreshCw,
} from "lucide-react";
import { fmtMinor } from "@/lib/money";
import {
  fraudDeskFn,
  fraudScanFn,
  fraudDecideFn,
  fraudRuleFn,
  fraudBlacklistAddFn,
  fraudBlacklistToggleFn,
} from "@/lib/fraud.functions";

export const Route = createFileRoute("/_authenticated/dashboard/fraud/")({
  loader: () => fraudDeskFn(),
  head: () => ({
    meta: [
      { title: "Fraud & Risk Protection — Framique Admin" },
      {
        name: "description",
        content:
          "Automated risk screening for your store orders. Review flagged transactions and manage blocked customers.",
      },
      {
        property: "og:title",
        content: "Fraud & Risk Protection — Framique Admin",
      },
      {
        property: "og:description",
        content:
          "Automated risk screening for your store orders. Review flagged transactions and manage blocked customers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FraudDesk,
});

type Desk = Awaited<ReturnType<typeof fraudDeskFn>>;
type ProtectionPreset = "balanced" | "strict" | "relaxed";

const FRIENDLY_SIGNALS: Record<string, string> = {
  BLACKLIST_MATCH: "Customer is on your store blocklist",
  HONEYPOT_TRIP: "Automated checkout bot detected",
  BOT_BEACON: "Automated browser script or scraper detected",
  CARDTESTING: "Multiple failed payment attempts detected",
  VELOCITY_LIMIT: "Unusually rapid checkout burst from this shopper",
  COD_REFUSAL_HISTORY: "Past record of refusing Cash on Delivery parcels",
  ADDRESS_CLUSTER: "Unusual shipping address cluster detected",
  NEW_DEVICE_HIGH_VALUE: "High-value cart placed from a new device",
  COD_MAX_AMOUNT: "Cash on Delivery total exceeds standard threshold",
};

const PRESET_INFO: Record<
  ProtectionPreset,
  {
    title: string;
    badge: string;
    description: string;
  }
> = {
  balanced: {
    title: "Balanced",
    badge: "Recommended",
    description:
      "Blocks checkout bots, repeated failed payments, and known spam while keeping the checkout smooth for genuine shoppers.",
  },
  strict: {
    title: "Strict",
    badge: "High Security",
    description:
      "Maximum scrutiny. Flags high-value carts from new devices and unverified customers for manual sign-off before shipping.",
  },
  relaxed: {
    title: "Relaxed",
    badge: "Fast Checkout",
    description:
      "Permissive mode. Blocks explicitly blacklisted phone numbers and honeypot bots without holding orders for review.",
  },
};

function getActivePreset(rules: Desk["rules"]): ProtectionPreset {
  const highVal = rules.find((r) => r.code === "NEW_DEVICE_HIGH_VALUE");
  if (highVal && !highVal.enabled) return "relaxed";
  const botBeacon = rules.find((r) => r.code === "BOT_BEACON");
  if (
    botBeacon &&
    (botBeacon.params as Record<string, number>)?.bot_score_max === 40
  )
    return "strict";
  return "balanced";
}

function riskTone(score: number) {
  if (score > 70)
    return "border-destructive/30 bg-destructive/10 text-destructive";
  if (score >= 40)
    return "border-warning/30 bg-warning/15 text-warning-foreground";
  return "border-border bg-muted text-muted-foreground";
}

function riskLevelLabel(score: number) {
  if (score > 70) return "High Risk";
  if (score >= 40) return "Medium Risk";
  return "Low Risk";
}

export function FraudDesk() {
  const desk = Route.useLoaderData();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "approved" | "rejected"
  >("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Blacklist form state
  const [blacklistInput, setBlacklistInput] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");

  // Optional note inputs for cases
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Advanced tuning disclosure
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activePreset = useMemo(() => getActivePreset(desk.rules), [desk.rules]);

  const filteredCases = useMemo(() => {
    return desk.cases.filter((c) => {
      if (
        statusFilter === "open" &&
        c.status !== "open" &&
        c.status !== "evidence_requested"
      )
        return false;
      if (statusFilter === "approved" && c.status !== "approved") return false;
      if (statusFilter === "rejected" && c.status !== "rejected") return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesNum = c.order_number.toLowerCase().includes(query);
        const matchesPhone = c.customer_phone_masked
          .toLowerCase()
          .includes(query);
        if (!matchesNum && !matchesPhone) return false;
      }
      return true;
    });
  }, [desk.cases, statusFilter, search]);

  async function run(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(successMsg);
      await router.invalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPreset(preset: ProtectionPreset) {
    setBusy(true);
    setMsg(null);
    try {
      if (preset === "relaxed") {
        for (const rule of desk.rules) {
          if (
            rule.code === "NEW_DEVICE_HIGH_VALUE" ||
            rule.code === "ADDRESS_CLUSTER"
          ) {
            await fraudRuleFn({
              data: {
                code: rule.code,
                enabled: false,
                params: rule.params as Record<string, number>,
              },
            });
          } else if (
            !rule.enabled &&
            (rule.code === "BLACKLIST_MATCH" || rule.code === "HONEYPOT_TRIP")
          ) {
            await fraudRuleFn({
              data: {
                code: rule.code,
                enabled: true,
                params: rule.params as Record<string, number>,
              },
            });
          }
        }
      } else if (preset === "strict") {
        for (const rule of desk.rules) {
          const params = { ...(rule.params as Record<string, number>) };
          if (rule.code === "BOT_BEACON") params.bot_score_max = 40;
          if (rule.code === "CARDTESTING") params.failed_attempts = 2;
          await fraudRuleFn({
            data: {
              code: rule.code,
              enabled: true,
              params,
            },
          });
        }
      } else {
        // Balanced
        for (const rule of desk.rules) {
          const cat = desk.catalog.find((c) => c.code === rule.code);
          await fraudRuleFn({
            data: {
              code: rule.code,
              enabled: true,
              params:
                (cat?.defaults as Record<string, number>) ??
                (rule.params as Record<string, number>),
            },
          });
        }
      }
      setMsg(`Protection sensitivity updated to ${PRESET_INFO[preset].title}.`);
      await router.invalidate();
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Failed to update protection sensitivity.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddBlacklist(e: React.FormEvent) {
    e.preventDefault();
    const val = blacklistInput.trim();
    if (!val || val.length < 3) return;
    const kind = val.includes("@") ? "email" : "phone";
    await run(
      () =>
        fraudBlacklistAddFn({
          data: {
            kind,
            value: val,
            reason: blacklistReason.trim() || null,
          },
        }),
      `Blocked ${val} from placing future orders.`,
    );
    setBlacklistInput("");
    setBlacklistReason("");
  }

  const pendingCount = desk.counts.pending;
  const blockedThreats = desk.counts.blocked + desk.counts.blacklisted;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-fq-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Fraud & Risk Protection
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated screening protects your store against bots, payment
            testing, and fraudulent orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/fraud/audit"
            className="inline-flex h-10 items-center gap-1.5 rounded-fq-md border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Audit Log
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => fraudScanFn(), "Risk scan finished. All orders updated.")
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            Scan Recent Orders
          </button>
        </div>
      </header>

      {/* Notification banner */}
      {msg && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-fq-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
        >
          <Info className="size-4 shrink-0 text-primary" />
          <p className="flex-1">{msg}</p>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3 Metric Cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div
          className={`rounded-fq-xl border p-5 transition-shadow ${
            pendingCount > 0
              ? "border-warning/40 bg-warning/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting Review
            </span>
            {pendingCount > 0 ? (
              <span className="flex size-2 rounded-full bg-warning animate-pulse" />
            ) : (
              <span className="flex size-2 rounded-full bg-success-strong" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">
              {pendingCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {pendingCount === 1 ? "order held" : "orders held"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {pendingCount > 0
              ? "Needs your approval before shipping"
              : "All clear — zero orders on hold"}
          </p>
        </div>

        <div className="rounded-fq-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Threats Blocked
            </span>
            <ShieldAlert className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">
              {blockedThreats}
            </span>
            <span className="text-xs text-muted-foreground">
              prevented attempts
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Bots, blacklisted shoppers, and honeypot hits
          </p>
        </div>

        <div className="rounded-fq-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Screened
            </span>
            <Shield className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">
              {desk.counts.flagged}
            </span>
            <span className="text-xs text-muted-foreground">
              evaluated cases
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Protected across all checkouts
          </p>
        </div>
      </section>

      {/* Store Protection Level Presets */}
      <section className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Protection Sensitivity
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Choose how strictly Framique screens incoming transactions. No manual
            formula or math required.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESET_INFO) as ProtectionPreset[]).map((presetKey) => {
            const info = PRESET_INFO[presetKey];
            const isSelected = activePreset === presetKey;
            return (
              <button
                key={presetKey}
                type="button"
                disabled={busy}
                onClick={() => applyPreset(presetKey)}
                className={`relative flex flex-col justify-between rounded-fq-lg border p-4 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/[0.03] ring-2 ring-primary/20 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{info.title}</span>
                    <span
                      className={`rounded-fq-sm px-2 py-0.5 text-[11px] font-medium ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isSelected ? "Active" : info.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {info.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Orders Flagged for Review */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Flagged Orders Review
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Review suspicious orders. Approve to release fulfillment hold, or
              cancel to safeguard inventory.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order or phone..."
                className="h-9 w-48 sm:w-60 rounded-fq-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "open" | "approved" | "rejected",
                )
              }
              className="h-9 rounded-fq-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="open">Awaiting Review ({pendingCount})</option>
              <option value="approved">Approved</option>
              <option value="rejected">Cancelled / Rejected</option>
            </select>
          </div>
        </div>

        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-fq-xl border border-dashed border-border bg-card/50 py-12 px-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-success-strong/10 text-success-strong">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold">
              {search.trim() || statusFilter !== "all"
                ? "No matching orders found"
                : "All orders are verified safe"}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {search.trim() || statusFilter !== "all"
                ? "Try adjusting your filters or search terms."
                : "No orders are currently held for fraud review. New flagged orders will appear here automatically."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map((c) => {
              const isPending =
                c.status === "open" || c.status === "evidence_requested";
              const signals = (c.signals ?? []) as Array<{
                code: string;
                label?: string;
                detail?: string;
              }>;
              const hasNoteOpen = expandedNoteId === c.id;

              return (
                <div
                  key={c.id}
                  className={`rounded-fq-xl border p-4 sm:p-5 transition-all ${
                    isPending
                      ? "border-warning/30 bg-card shadow-xs"
                      : "border-border bg-card/60"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.order_id ? (
                          <Link
                            to="/dashboard/orders/$orderId"
                            params={{ orderId: c.order_id }}
                            className="font-bold text-base hover:underline inline-flex items-center gap-1"
                          >
                            #{c.order_number}
                            <ExternalLink className="size-3 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span className="font-bold text-base">
                            #{c.order_number}
                          </span>
                        )}

                        <span
                          className={`rounded-fq-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${riskTone(
                            c.risk_score,
                          )}`}
                        >
                          {riskLevelLabel(c.risk_score)} ({c.risk_score}/100)
                        </span>

                        {isPending && (
                          <span className="inline-flex items-center gap-1 rounded-fq-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                            <Clock className="size-3" />
                            Fulfillment Held
                          </span>
                        )}

                        {c.status === "approved" && (
                          <span className="inline-flex items-center gap-1 rounded-fq-full bg-success-strong/15 px-2.5 py-0.5 text-xs font-medium text-success-strong">
                            <CheckCircle2 className="size-3" />
                            Approved
                          </span>
                        )}

                        {c.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-fq-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
                            <XCircle className="size-3" />
                            Rejected / Cancelled
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                        Customer:{" "}
                        <span className="font-medium text-foreground">
                          {c.customer_phone_masked}
                        </span>{" "}
                        · Total:{" "}
                        <span className="font-semibold text-foreground tabular-nums">
                          {fmtMinor(c.amount_minor_int, c.currency_code)}
                        </span>
                      </p>
                    </div>

                    {/* Critical Actions for Pending Orders */}
                    {isPending ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                fraudDecideFn({
                                  data: {
                                    caseId: c.id,
                                    decision: "approved",
                                    note:
                                      notes[c.id]?.trim() ||
                                      "Approved by merchant",
                                  },
                                }),
                              `Order #${c.order_number} approved and released for fulfillment.`,
                            )
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-fq-md bg-success-strong px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-success-strong/90 disabled:opacity-50"
                        >
                          <CheckCircle2 className="size-3.5" />
                          Approve Order
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                fraudDecideFn({
                                  data: {
                                    caseId: c.id,
                                    decision: "rejected",
                                    note:
                                      notes[c.id]?.trim() ||
                                      "Cancelled due to risk",
                                  },
                                }),
                              `Order #${c.order_number} marked as rejected.`,
                            )
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-fq-md border border-destructive/30 bg-destructive/10 px-3.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                        >
                          <XCircle className="size-3.5" />
                          Cancel Order
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedNoteId(hasNoteOpen ? null : c.id)
                          }
                          className="inline-flex h-9 items-center gap-1 rounded-fq-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Add decision note"
                        >
                          Note
                          {hasNoteOpen ? (
                            <ChevronUp className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-muted-foreground">
                        {c.decision_at && (
                          <p>
                            Decided{" "}
                            {new Date(c.decision_at).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        )}
                        {c.decision_note && (
                          <p className="italic mt-0.5 max-w-xs truncate">
                            &quot;{c.decision_note}&quot;
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Why Flagged (Plain English Reasons) */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                    <span className="text-xs font-medium text-muted-foreground">
                      Detection reasons:
                    </span>
                    {signals.length > 0 ? (
                      signals.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-fq-sm bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                        >
                          {FRIENDLY_SIGNALS[s.code] ??
                            s.detail ??
                            s.label ??
                            s.code}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        General risk score threshold exceeded
                      </span>
                    )}
                  </div>

                  {/* Optional Note Field */}
                  {hasNoteOpen && isPending && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <input
                        value={notes[c.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        placeholder="Add an optional internal note for this decision..."
                        className="h-9 w-full rounded-fq-md border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Customer Blocklist */}
      <section className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Customer Blocklist
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Instantly prevent problematic phone numbers or email addresses from
            placing orders on your storefront.
          </p>
        </div>

        <form
          onSubmit={handleAddBlacklist}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            value={blacklistInput}
            onChange={(e) => setBlacklistInput(e.target.value)}
            placeholder="Enter customer phone or email..."
            className="h-10 flex-1 rounded-fq-md border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={blacklistReason}
            onChange={(e) => setBlacklistReason(e.target.value)}
            placeholder="Reason (optional, e.g. Fake COD returns)"
            className="h-10 flex-1 rounded-fq-md border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={busy || blacklistInput.trim().length < 3}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-fq-md bg-destructive px-4 text-sm font-semibold text-white shadow-xs hover:bg-destructive/90 disabled:opacity-50 shrink-0"
          >
            <UserX className="size-4" />
            Block Customer
          </button>
        </form>

        <div className="rounded-fq-lg border border-border divide-y divide-border overflow-hidden">
          {desk.blacklist.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center">
              No blocked customers. Add a phone number or email above to block.
            </p>
          ) : (
            desk.blacklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 text-sm bg-card hover:bg-muted/30"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{item.value}</span>
                    <span className="rounded-fq-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.kind}
                    </span>
                    {!item.active && (
                      <span className="rounded-fq-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
                        Whitelisted
                      </span>
                    )}
                  </div>
                  {item.reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.reason}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        fraudBlacklistToggleFn({
                          data: { id: item.id, active: !item.active },
                        }),
                      item.active
                        ? `Unblocked ${item.value}.`
                        : `Re-blocked ${item.value}.`,
                    )
                  }
                  className="h-8 rounded-fq-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {item.active ? "Unblock" : "Re-block"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Advanced Rule Tuning Accordion */}
      <section className="rounded-fq-xl border border-border bg-card p-5">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              Advanced Rule Customization
            </span>
          </div>
          {showAdvanced ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              These underlying rules run automatically during checkout. You can
              enable or disable specific checks below.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {desk.catalog.map((cat) => {
                const rule = desk.rules.find((r) => r.code === cat.code);
                const isEnabled = rule?.enabled ?? true;
                return (
                  <div
                    key={cat.code}
                    className="flex items-start justify-between gap-3 rounded-fq-lg border border-border/80 bg-background/50 p-3"
                  >
                    <div>
                      <p className="font-semibold text-xs text-foreground">
                        {cat.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                        {cat.hint}
                      </p>
                    </div>

                    <label className="flex items-center gap-1.5 text-xs shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            () =>
                              fraudRuleFn({
                                data: {
                                  code: cat.code,
                                  enabled: e.target.checked,
                                  params:
                                    (rule?.params as Record<string, number>) ??
                                    {},
                                },
                              }),
                            `Rule ${cat.title} updated.`,
                          )
                        }
                        className="rounded border-border"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {isEnabled ? "Active" : "Off"}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
