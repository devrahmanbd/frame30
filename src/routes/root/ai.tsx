import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { alertEngine } from "@/lib/audio-alert";
import {
  ownerAiFn,
  ownerSetFlagFn,
  ownerGetConversationMessagesFn,
  ownerSendAgentMessageFn,
  ownerSetTakeoverModeFn,
  ownerUpdateConversationStatusFn,
  ownerSetConversationPriorityFn,
  ownerSaveOperatorNotesFn,
  ownerExportConversationTranscriptFn,
} from "@/lib/owner.functions";
import {
  CANNED_RESPONSES,
  interpolateMacro,
  searchCannedResponses,
  type CannedResponse,
  type MacroCategory,
} from "@/lib/support-canned-responses";
import {
  computeSlaMetrics,
  buildAuditTrail,
  type SlaMetrics,
  type SlaStatus,
  type AuditEvent,
} from "@/lib/support-sla";
import {
  FlagSwitch,
  OwnerHeader,
  StatCard,
  StatGrid,
  StatePill,
} from "@/components/root/OwnerUi";

// ─────────────────────────────────────────────────────────────────────────────
// Route definition
// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/root/ai")({
  head: () => ({
    meta: [
      { title: "AI Support Moderation — Framique Owner Console" },
      {
        name: "description",
        content:
          "Live support moderation workbench: cross-tenant conversation queue, human takeover, priority triage, private operator notes, and real-time reply dispatch.",
      },
      { property: "og:title", content: "AI Moderation Desk — Framique" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiDesk,
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared type helpers (subset matching what the server returns)
// ─────────────────────────────────────────────────────────────────────────────

type ConvRow = {
  id: string;
  merchant_id: string;
  merchantName: string | null;
  merchantEmail: string | null;
  channel: string;
  status: string;
  order_number: string | null;
  takeover_mode: string | null;
  priority: string | null;
  needsHumanAgent: boolean;
  priorityRank: number;
  last_message_at: string;
  last_customer_message_at: string | null;
  last_operator_message_at: string | null;
  operator_notes: string | null;
  created_at?: string;
  resolved_at?: string | null;
};

type Message = {
  id: string;
  role: string;
  body: string;
  flagged: boolean;
  created_at: string;
  sent_by_operator_id?: string | null;
  is_internal_note?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors";
const btnActive = "bg-primary text-primary-foreground border-primary hover:bg-primary/90";
const btnDestructive = "border-destructive/40 text-destructive hover:bg-destructive/10";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-destructive/15 text-destructive font-semibold",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted/50 text-muted-foreground",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "🔴 Urgent",
  high: "🟠 High",
  normal: "⚪ Normal",
  low: "🔵 Low",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function slaColor(iso: string | null) {
  if (!iso) return "text-muted-foreground";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins > 30) return "text-destructive";
  if (mins > 10) return "text-orange-500 dark:text-orange-400";
  return "text-muted-foreground";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "normal";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-4 ${PRIORITY_BADGE[p] ?? PRIORITY_BADGE.normal}`}
    >
      {PRIORITY_LABELS[p] ?? p}
    </span>
  );
}

function TakeoverBadge({ mode }: { mode: string | null }) {
  const isHuman = mode === "human_takeover";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isHuman
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-primary/10 text-primary"
      }`}
    >
      {isHuman ? "👤 Human" : "🤖 AI"}
    </span>
  );
}

function SlaBadge({ metrics }: { metrics: SlaMetrics }) {
  const badgeColors: Record<SlaStatus, string> = {
    met: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 animate-pulse",
    breached: "bg-destructive/15 text-destructive border-destructive/30 font-semibold",
    pending: "bg-muted text-muted-foreground border-border",
  };

  const statusIcons: Record<SlaStatus, string> = {
    met: "🟢 SLA Met",
    at_risk: "🟡 SLA At Risk",
    breached: "🔴 SLA Breached",
    pending: "⏱ SLA Pending",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${badgeColors[metrics.slaStatus]}`}
      title={`TTFR: ${metrics.formattedTtfr} (Tier: ${metrics.priority}) | Resolution: ${metrics.formattedResolutionTime}`}
    >
      <span>{statusIcons[metrics.slaStatus]}</span>
      <span className="opacity-75">· TTFR {metrics.formattedTtfr}</span>
    </span>
  );
}

// ─── Left pane: conversation queue ──────────────────────────────────────────

type QueueFilter = "all" | "needs_agent" | "open" | "in_progress" | "closed";

function ConversationQueue({
  rows,
  counts,
  selectedId,
  onSelect,
}: {
  rows: ConvRow[];
  counts: { open: number; needsAgent: number; humanTakeover: number; inProgress: number; resolved: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = rows
    .filter((c) => {
      if (tab === "needs_agent") return c.needsHumanAgent;
      if (tab === "open") return c.status === "open";
      if (tab === "in_progress") return c.status === "in_progress";
      if (tab === "closed") return c.status === "resolved" || c.status === "closed";
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.merchantName ?? "").toLowerCase().includes(q) ||
        (c.order_number ?? "").toLowerCase().includes(q) ||
        (c.channel ?? "").toLowerCase().includes(q)
      );
    })
    // Sort: needs human agent first, then by priorityRank desc, then last customer message desc
    .sort((a, b) => {
      if (a.needsHumanAgent !== b.needsHumanAgent) return a.needsHumanAgent ? -1 : 1;
      if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
      if (a.last_customer_message_at && b.last_customer_message_at)
        return new Date(b.last_customer_message_at).getTime() - new Date(a.last_customer_message_at).getTime();
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

  const tabs: { key: QueueFilter; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    {
      key: "needs_agent",
      label: "Needs Agent",
      count: counts.needsAgent,
    },
    { key: "open", label: "Open", count: counts.open },
    { key: "in_progress", label: "In Progress", count: counts.inProgress },
    { key: "closed", label: "Closed" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`queue-tab-${t.key}`}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 ? (
              <span
                className={`min-w-[1.2rem] rounded-full px-1 py-0.5 text-center text-[9px] leading-none font-semibold ${
                  t.key === "needs_agent"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border p-2">
        <input
          id="queue-search"
          type="search"
          placeholder="Search store, order, channel…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          aria-label="Search conversations"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No conversations found.</p>
        ) : (
          <ul role="listbox" aria-label="Conversation queue">
            {filtered.map((c) => (
              <li key={c.id} role="option" aria-selected={c.id === selectedId}>
                <button
                  id={`conv-row-${c.id}`}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`w-full border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
                    c.id === selectedId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="max-w-[140px] truncate text-sm font-medium">
                      {c.merchantName ?? c.merchant_id.slice(0, 8)}
                    </span>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`text-[10px] tabular-nums ${slaColor(c.last_customer_message_at)}`}
                      >
                        {c.last_customer_message_at
                          ? relTime(c.last_customer_message_at)
                          : relTime(c.last_message_at)}
                      </span>
                      {c.needsHumanAgent ? (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-label="Needs agent" />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {c.needsHumanAgent ? (
                      <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/30 animate-pulse">
                        🔴 Needs Agent
                      </span>
                    ) : null}
                    <TakeoverBadge mode={c.takeover_mode} />
                    <PriorityBadge priority={c.priority} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.channel}
                    </span>
                    {c.order_number ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        #{c.order_number}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer count */}
      <div className="shrink-0 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {filtered.length} of {rows.length} conversations
        {counts.humanTakeover > 0 ? (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            • {counts.humanTakeover} human takeover
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Right pane: conversation detail & controls ──────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isAgent = msg.role === "agent";
  const isBot = msg.role === "assistant" || msg.role === "bot";
  const isInternal = msg.is_internal_note;

  if (isInternal) {
    return (
      <div className="my-1 flex justify-center">
        <div className="max-w-[85%] rounded-fq-md border border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="mr-1 font-semibold">🔒 Internal note:</span>
          {msg.body}
        </div>
      </div>
    );
  }

  const align = isAgent ? "items-end" : "items-start";
  const bubbleStyle = isAgent
    ? "bg-primary text-primary-foreground"
    : isBot
      ? "bg-muted text-foreground border border-border"
      : "bg-background border border-border text-foreground";

  const roleLabel = isAgent ? "Agent" : isBot ? "Bot" : "Customer";

  return (
    <div className={`my-1 flex flex-col ${align}`}>
      <span className="mb-0.5 px-1 text-[10px] text-muted-foreground">{roleLabel}</span>
      <div
        className={`max-w-[85%] rounded-fq-md px-3 py-2 text-sm ${bubbleStyle}`}
        aria-label={`${roleLabel} message`}
      >
        {msg.body}
        {msg.flagged ? (
          <span className="ml-2 text-[10px] text-destructive font-semibold">⚠ flagged</span>
        ) : null}
      </div>
      <span className="mt-0.5 px-1 text-[9px] text-muted-foreground tabular-nums">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function ExportTranscriptDropdown({
  convId,
  onExport,
  isExporting,
}: {
  convId: string;
  onExport: (format: "markdown" | "jsonl" | "csv", redactPii: boolean) => void;
  isExporting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [redactPii, setRedactPii] = useState(true);

  return (
    <div className="relative">
      <button
        id="export-transcript-btn"
        type="button"
        disabled={isExporting}
        onClick={() => setOpen((v) => !v)}
        className={`${btn} flex items-center gap-1 text-[11px]`}
      >
        <span>📥 Export</span>
        <span className="text-[9px]">▾</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-fq-md border border-border bg-card p-2 shadow-lg text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-1.5 px-1">
              <span className="font-semibold text-[11px]">Export Format</span>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={redactPii}
                  onChange={(e) => setRedactPii(e.target.checked)}
                  className="rounded"
                />
                Redact PII
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onExport("markdown", redactPii);
              }}
              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted text-[11px]"
            >
              <span>📄</span>
              <div>
                <p className="font-medium">Markdown (.md)</p>
                <p className="text-[9px] text-muted-foreground">Human-readable log</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onExport("jsonl", redactPii);
              }}
              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted text-[11px]"
            >
              <span>🧾</span>
              <div>
                <p className="font-medium">JSON Lines (.jsonl)</p>
                <p className="text-[9px] text-muted-foreground">Machine-readable data</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onExport("csv", redactPii);
              }}
              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted text-[11px]"
            >
              <span>📊</span>
              <div>
                <p className="font-medium">CSV (.csv)</p>
                <p className="text-[9px] text-muted-foreground">Spreadsheet analysis</p>
              </div>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AuditTrailView({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No audit events recorded for this conversation.
      </div>
    );
  }

  const iconMap: Record<AuditEvent["type"], string> = {
    created: "🚀",
    customer_message: "💬",
    ai_reply: "🤖",
    human_takeover_started: "👤",
    human_takeover_released: "🤖",
    operator_message: "👨‍💻",
    internal_note: "🔒",
    priority_changed: "🔺",
    status_changed: "📌",
    resolved: "✅",
    closed: "📁",
  };

  const actorBadgeMap: Record<AuditEvent["actor"], { label: string; class: string }> = {
    customer: { label: "Customer", class: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    operator: { label: "Operator", class: "bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold" },
    bot: { label: "AI Bot", class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    system: { label: "System", class: "bg-muted text-muted-foreground" },
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3" role="region" aria-label="Audit trail timeline">
      <div className="relative border-l-2 border-border/70 ml-3 space-y-4 py-2">
        {events.map((evt) => {
          const badge = actorBadgeMap[evt.actor] ?? actorBadgeMap.system;
          const time = new Date(evt.timestamp);
          return (
            <div key={evt.id} className="relative pl-6">
              <div className="absolute -left-2.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border text-xs shadow-xs">
                <span>{iconMap[evt.type] ?? "•"}</span>
              </div>

              <div className="rounded-fq-md border border-border/60 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] ${badge.class}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] font-medium">{evt.description}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {time.toLocaleDateString([], { month: "short", day: "numeric" })} ·{" "}
                    {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                {evt.descriptionBn ? (
                  <p className="text-[10px] text-muted-foreground/80">{evt.descriptionBn}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MacroPickerModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (macro: CannedResponse) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MacroCategory | "all">("all");

  if (!isOpen) return null;

  const results = searchCannedResponses(
    query,
    category === "all" ? undefined : category,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-fq-lg border border-border bg-card p-4 shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold">⚡ Canned Responses & Macros</h3>
            <p className="text-xs text-muted-foreground">Select a snippet to interpolate into reply</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 mb-3">
          <input
            type="search"
            placeholder="Search macros (shortcut, title, or text)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-fq-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            {(
              [
                { key: "all", label: "All" },
                { key: "greetings", label: "Greetings" },
                { key: "order_inquiry", label: "Orders" },
                { key: "shipping_courier", label: "Shipping" },
                { key: "refunds_returns", label: "Refunds" },
                { key: "delays", label: "Delays" },
                { key: "resolution_closure", label: "Closure" },
                { key: "escalation", label: "Escalation" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  category === cat.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {results.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No matching canned responses.</p>
          ) : (
            results.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelect(m)}
                className="group cursor-pointer rounded-fq-md border border-border/70 p-2.5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                      {m.shortcut}
                    </span>
                    <span className="text-xs font-semibold">{m.title}</span>
                  </div>
                  <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                    {m.category}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{m.body}</p>
                <p className="text-[10px] text-muted-foreground/80 line-clamp-1 mt-0.5 italic">{m.bodyBn}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationDetail({
  conv,
  allConvs,
  onUpdate,
}: {
  conv: ConvRow;
  allConvs: ConvRow[];
  onUpdate: () => void;
}) {
  const qc = useQueryClient();
  const getMessages = useServerFn(ownerGetConversationMessagesFn);
  const sendMessage = useServerFn(ownerSendAgentMessageFn);
  const setTakeover = useServerFn(ownerSetTakeoverModeFn);
  const setStatus = useServerFn(ownerUpdateConversationStatusFn);
  const setPriority = useServerFn(ownerSetConversationPriorityFn);
  const saveNotes = useServerFn(ownerSaveOperatorNotesFn);
  const exportTranscript = useServerFn(ownerExportConversationTranscriptFn);

  const [replyBody, setReplyBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [notesBody, setNotesBody] = useState(conv.operator_notes ?? "");
  const [showNotes, setShowNotes] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "audit">("chat");
  const [showMacroPicker, setShowMacroPicker] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: msgData, isLoading: msgsLoading } = useQuery({
    queryKey: ["ai-conv-messages", conv.id],
    queryFn: () => getMessages({ data: { conversationId: conv.id } }),
    refetchInterval: 5000,
  });

  const messages = msgData?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Sync notes body when conv changes
  useEffect(() => {
    setNotesBody(conv.operator_notes ?? "");
  }, [conv.id, conv.operator_notes]);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["ai-conv-messages", conv.id] });
    onUpdate();
  }, [qc, conv.id, onUpdate]);

  const takeoverMut = useMutation({
    mutationFn: (mode: "ai" | "human_takeover") =>
      setTakeover({ data: { conversationId: conv.id, mode } }),
    onSuccess: (res) => {
      toast.success(`Takeover → ${res.mode === "human_takeover" ? "👤 Human" : "🤖 AI"}`);
      invalidate();
    },
    onError: () => toast.error("Failed to change takeover mode"),
  });

  const statusMut = useMutation({
    mutationFn: (status: "open" | "in_progress" | "resolved" | "closed") =>
      setStatus({ data: { conversationId: conv.id, status } }),
    onSuccess: (res) => {
      toast.success(`Status → ${STATUS_LABELS[res.status] ?? res.status}`);
      invalidate();
    },
    onError: () => toast.error("Failed to update status"),
  });

  const priorityMut = useMutation({
    mutationFn: (priority: "low" | "normal" | "high" | "urgent") =>
      setPriority({ data: { conversationId: conv.id, priority } }),
    onSuccess: (res) => {
      toast.success(`Priority → ${PRIORITY_LABELS[res.priority] ?? res.priority}`);
      invalidate();
    },
    onError: () => toast.error("Failed to update priority"),
  });

  const notesMut = useMutation({
    mutationFn: (notes: string) => saveNotes({ data: { conversationId: conv.id, notes } }),
    onSuccess: () => {
      toast.success("Notes saved");
      invalidate();
    },
    onError: () => toast.error("Failed to save notes"),
  });

  const replyMut = useMutation({
    mutationFn: () =>
      sendMessage({
        data: {
          conversationId: conv.id,
          merchantId: conv.merchant_id,
          body: replyBody.trim(),
          isInternalNote,
        },
      }),
    onSuccess: () => {
      setReplyBody("");
      invalidate();
      toast.success(isInternalNote ? "Internal note posted" : "Message sent");
    },
    onError: () => toast.error("Failed to send message"),
  });

  const slaMetrics = useMemo(() => {
    return computeSlaMetrics({
      createdAt: conv.created_at ?? conv.last_message_at,
      priority: conv.priority,
      status: conv.status,
      lastCustomerMessageAt: conv.last_customer_message_at,
      lastOperatorMessageAt: conv.last_operator_message_at,
      resolvedAt: conv.resolved_at,
    });
  }, [
    conv.created_at,
    conv.last_message_at,
    conv.priority,
    conv.status,
    conv.last_customer_message_at,
    conv.last_operator_message_at,
    conv.resolved_at,
  ]);

  const auditEvents = useMemo(() => {
    return buildAuditTrail(
      {
        id: conv.id,
        createdAt: conv.created_at ?? conv.last_message_at,
        resolvedAt: conv.resolved_at,
        status: conv.status,
        takeoverMode: conv.takeover_mode,
        priority: conv.priority,
      },
      messages,
    );
  }, [conv, messages]);

  const handleExport = async (format: "markdown" | "jsonl" | "csv", redactPii: boolean) => {
    setIsExporting(true);
    try {
      const res = await exportTranscript({
        data: {
          conversationId: conv.id,
          format,
          options: { redactPii, includeInternalNotes: true },
        },
      });
      if (res.ok && res.content) {
        const blob = new Blob([res.content], { type: res.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported transcript (${format.toUpperCase()})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export transcript";
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const insertMacro = (macro: CannedResponse) => {
    const interpolated = interpolateMacro(macro.body, {
      merchantName: conv.merchantName ?? "Customer",
      orderNumber: conv.order_number ?? "N/A",
      operatorName: "Framique Support",
    });
    setReplyBody((prev) => (prev ? `${prev}\n${interpolated}` : interpolated));
    setShowMacroPicker(false);
  };

  const isHumanMode = conv.takeover_mode === "human_takeover";

  return (
    <div className="flex h-full flex-col">
      {/* ── Header bar ── */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold leading-tight">
              {conv.merchantName ?? conv.merchant_id.slice(0, 8)}
            </p>
            {conv.merchantEmail ? (
              <p className="text-[11px] text-muted-foreground">{conv.merchantEmail}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TakeoverBadge mode={conv.takeover_mode} />
              <PriorityBadge priority={conv.priority} />
              <SlaBadge metrics={slaMetrics} />
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {conv.channel}
              </span>
              {conv.order_number ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  #{conv.order_number}
                </span>
              ) : null}
            </div>
          </div>

          {/* Takeover toggle */}
          <button
            id="takeover-toggle-btn"
            type="button"
            disabled={takeoverMut.isPending}
            onClick={() =>
              takeoverMut.mutate(isHumanMode ? "ai" : "human_takeover")
            }
            className={`shrink-0 rounded-fq-md border px-3 py-1.5 text-xs font-semibold transition-all ${
              isHumanMode ? `${btnActive} animate-none` : "border-border hover:bg-muted"
            } disabled:opacity-50`}
            aria-pressed={isHumanMode}
          >
            {isHumanMode ? "👤 Human Takeover — Click to release" : "🤖 AI Active — Take over"}
          </button>
        </div>

        {/* ── Controls row ── */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status lifecycle */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Status:</span>
              {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
                <button
                  key={s}
                  id={`status-btn-${s}`}
                  type="button"
                  disabled={statusMut.isPending || conv.status === s}
                  onClick={() => statusMut.mutate(s)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    conv.status === s
                      ? "bg-primary/15 text-primary"
                      : "border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Priority selector */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Priority:</span>
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  id={`priority-btn-${p}`}
                  type="button"
                  disabled={priorityMut.isPending || (conv.priority ?? "normal") === p}
                  onClick={() => priorityMut.mutate(p)}
                  className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                    (conv.priority ?? "normal") === p
                      ? PRIORITY_BADGE[p]
                      : "border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notes drawer toggle */}
            <button
              id="notes-drawer-toggle"
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className={`${btn} ${showNotes ? btnActive : ""}`}
            >
              🗒 Operator Notes
            </button>

            {/* Export transcript dropdown */}
            <ExportTranscriptDropdown
              convId={conv.id}
              onExport={handleExport}
              isExporting={isExporting}
            />
          </div>
        </div>

        {/* ── Private notes drawer ── */}
        {showNotes ? (
          <div className="mt-3 rounded-fq-md border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20 p-3">
            <p className="mb-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              🔒 Private Operator Notes — never visible to merchants or shoppers
            </p>
            <textarea
              id="operator-notes-textarea"
              value={notesBody}
              onChange={(e) => setNotesBody(e.target.value)}
              rows={4}
              placeholder="Handover context, escalation history, billing notes…"
              className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              aria-label="Private operator notes"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                id="notes-save-btn"
                type="button"
                disabled={notesMut.isPending}
                onClick={() => notesMut.mutate(notesBody)}
                className={`${btn} ${btnActive}`}
              >
                {notesMut.isPending ? "Saving…" : "Save Notes"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── View Sub-tabs (Chat vs Audit Trail) ── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 bg-muted/10">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "chat"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          💬 Chat ({messages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "audit"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          📜 Audit Trail ({auditEvents.length})
        </button>
      </div>

      {/* ── Tab Content: Audit Trail or Chat ── */}
      {activeTab === "audit" ? (
        <AuditTrailView events={auditEvents} />
      ) : (
        <>
          {/* ── Message stream ── */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            role="log"
            aria-live="polite"
            aria-label="Conversation transcript"
          >
            {msgsLoading ? (
              <p className="text-center text-sm text-muted-foreground">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} msg={m} />)
            )}
            <div ref={bottomRef} aria-hidden />
          </div>

          {/* ── Reply box ── */}
          <div className="shrink-0 border-t border-border p-3">
            {/* Quick Macro Chips Row */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2">
              <button
                id="open-macros-modal-btn"
                type="button"
                onClick={() => setShowMacroPicker(true)}
                className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                title="Browse and search all canned responses"
              >
                ⚡ Macros
              </button>
              {CANNED_RESPONSES.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => insertMacro(m)}
                  className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] hover:bg-muted transition-colors"
                  title={m.title}
                >
                  <span className="font-mono text-[9px] text-primary">{m.shortcut}</span>
                </button>
              ))}
            </div>

            {/* Internal note toggle */}
            <div className="mb-2 flex items-center gap-2">
              <button
                id="reply-type-toggle"
                type="button"
                onClick={() => setIsInternalNote((v) => !v)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isInternalNote
                    ? "border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
                aria-pressed={isInternalNote}
              >
                {isInternalNote ? "🔒 Internal Note" : "💬 Public Reply"}
              </button>
              {!isHumanMode && !isInternalNote ? (
                <span className="text-[10px] text-amber-600 dark:text-amber-500">
                  ⚠ Bot is active — take over first to prevent AI from also replying
                </span>
              ) : null}
            </div>

            <div className="flex gap-2">
              <textarea
                id="reply-textarea"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && replyBody.trim()) {
                    e.preventDefault();
                    replyMut.mutate();
                  }
                }}
                rows={3}
                placeholder={
                  isInternalNote
                    ? "Write a private note… (only visible to operators)"
                    : "Write a reply to the customer… (Ctrl+Enter to send)"
                }
                className="flex-1 rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                aria-label={isInternalNote ? "Internal operator note" : "Reply to customer"}
              />
              <div className="flex flex-col gap-1">
                <button
                  id="send-reply-btn"
                  type="button"
                  disabled={replyMut.isPending || !replyBody.trim()}
                  onClick={() => replyMut.mutate()}
                  className={`${btn} ${isInternalNote ? "" : btnActive} disabled:opacity-50`}
                >
                  {replyMut.isPending ? "…" : isInternalNote ? "Add Note" : "Send"}
                </button>
                <button
                  id="send-resolve-btn"
                  type="button"
                  disabled={statusMut.isPending}
                  onClick={() => statusMut.mutate("resolved")}
                  className={`${btn} ${btnDestructive} text-[10px]`}
                >
                  Resolve
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
          </div>
        </>
      )}

      {/* Macro Picker Modal */}
      <MacroPickerModal
        isOpen={showMacroPicker}
        onClose={() => setShowMacroPicker(false)}
        onSelect={insertMacro}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

function AiDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerAiFn);
  const setFlag = useServerFn(ownerSetFlagFn);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => alertEngine.isMuted());
  const [notifPerm, setNotifPerm] = useState(() => alertEngine.getNotificationPermission());

  const prevNeedsAgentRef = useRef<number | null>(null);
  const prevLatestMsgMapRef = useRef<Map<string, string>>(new Map());

  const { data, isLoading } = useQuery({
    queryKey: ["owner-ai"],
    queryFn: () => load(),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000, // poll every 10s for new messages
  });

  const toggleAi = useMutation({
    mutationFn: (value: boolean) =>
      setFlag({ data: { key: "ai_support_enabled", value } }),
    onSuccess: () => {
      toast.success(tk("owner.flag_saved"));
      void qc.invalidateQueries({ queryKey: ["owner-ai"] });
    },
    onError: () => toast.error(tk("owner.flag_failed")),
  });

  const rows = (data?.rows ?? []) as ConvRow[];
  const counts = data?.counts ?? {
    open: 0,
    needsAgent: 0,
    humanTakeover: 0,
    inProgress: 0,
    resolved: 0,
  };

  // ── Multi-sensory alert engine triggers ──────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const currentNeedsAgent = counts.needsAgent;
    const prevNeedsAgent = prevNeedsAgentRef.current;

    // Escalation alert: needsAgent count jumped
    if (prevNeedsAgent !== null && currentNeedsAgent > prevNeedsAgent) {
      alertEngine.playUrgentAlert();
      alertEngine.sendDesktopNotification({
        title: "🔴 Customer Escalation Needs Agent",
        body: `${currentNeedsAgent} conversation(s) awaiting human specialist on /root/ai.`,
      });
      alertEngine.startTitleAlert(currentNeedsAgent);
    } else if (currentNeedsAgent > 0) {
      // Check if any escalated or open chat got a new message from a customer
      let hasNewCustomerMsg = false;
      for (const r of rows) {
        const prevMsgTime = prevLatestMsgMapRef.current.get(r.id);
        if (r.last_customer_message_at && prevMsgTime && r.last_customer_message_at > prevMsgTime) {
          hasNewCustomerMsg = true;
          break;
        }
      }
      if (hasNewCustomerMsg) {
        alertEngine.playChime();
        alertEngine.sendDesktopNotification({
          title: "💬 New Customer Message in Support Queue",
          body: "A shopper replied to an escalated conversation.",
        });
      }
    }

    // Dynamic browser tab title alerts
    if (currentNeedsAgent === 0) {
      alertEngine.stopTitleAlert();
    } else if (prevNeedsAgent === null && currentNeedsAgent > 0) {
      alertEngine.startTitleAlert(currentNeedsAgent);
    }

    prevNeedsAgentRef.current = currentNeedsAgent;
    const newMap = new Map<string, string>();
    for (const r of rows) {
      if (r.last_customer_message_at) newMap.set(r.id, r.last_customer_message_at);
    }
    prevLatestMsgMapRef.current = newMap;
  }, [data, counts.needsAgent, rows]);

  // Clean up title on unmount
  useEffect(() => {
    return () => alertEngine.stopTitleAlert();
  }, []);

  const selectedConv = rows.find((r) => r.id === selectedId) ?? null;

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["owner-ai"] });
  }, [qc]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* ── Page header + alert toolbar + kill switch ── */}
      <div className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OwnerHeader
            title={tk("owner.ai.title")}
            subtitle="Live cross-tenant support queue — take over conversations, triage priority, send replies, and add private operator notes."
          />

          {/* Alert Controls */}
          <div className="flex items-center gap-2">
            <button
              id="alert-sound-toggle-btn"
              type="button"
              onClick={() => {
                alertEngine.unlock();
                const next = alertEngine.toggleMute();
                setIsMuted(next);
                if (!next) {
                  alertEngine.playChime();
                  toast.success("Alert chime enabled (melodic + urgent)");
                } else {
                  toast.info("Alert chime muted");
                }
              }}
              className={`${btn} flex items-center gap-1.5`}
              aria-label={isMuted ? "Unmute alert sound" : "Mute alert sound"}
            >
              {isMuted ? "🔇 Sound Muted" : "🔊 Sound Active"}
            </button>

            {notifPerm === "default" ? (
              <button
                id="alert-notif-perm-btn"
                type="button"
                onClick={async () => {
                  const res = await alertEngine.requestNotificationPermission();
                  setNotifPerm(res);
                  if (res === "granted") {
                    toast.success("Desktop push alerts enabled");
                    alertEngine.sendDesktopNotification({
                      title: "Framique Alerts Enabled",
                      body: "You will receive desktop notifications when customers need human assistance.",
                      force: true,
                    });
                  }
                }}
                className={`${btn} border-primary/40 text-primary hover:bg-primary/10`}
              >
                🔔 Enable Desktop Alerts
              </button>
            ) : null}
          </div>
        </div>

        <FlagSwitch
          label={tk("owner.ai.assistant")}
          hint={tk("owner.audited")}
          enabled={data?.aiEnabled !== false}
          onLabel={tk("owner.on")}
          offLabel={tk("owner.off")}
          pending={toggleAi.isPending}
          onToggle={(next) => toggleAi.mutate(next)}
        />

        <StatGrid>
          <StatCard label="Open" value={String(counts.open)} />
          <StatCard
            label="Needs Agent 🔴"
            value={String(counts.needsAgent)}
          />
          <StatCard label="Human Takeover" value={String(counts.humanTakeover)} />
          <StatCard label="In Progress" value={String(counts.inProgress)} />
          <StatCard label="Resolved" value={String(counts.resolved)} />
        </StatGrid>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tk("common.loading")}</p>
      ) : null}

      {/* ── Split-pane moderation workbench ── */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden rounded-fq-lg border border-border"
        role="region"
        aria-label="Support moderation workbench"
      >
        {/* Left pane — live queue */}
        <div
          className="w-80 shrink-0 border-r border-border overflow-hidden"
          role="navigation"
          aria-label="Conversation queue"
        >
          <ConversationQueue
            rows={rows}
            counts={counts}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right pane — transcript + controls */}
        <div className="flex-1 overflow-hidden">
          {selectedConv ? (
            <ConversationDetail
              conv={selectedConv}
              allConvs={rows}
              onUpdate={invalidateAll}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="space-y-1 text-center">
                <p className="text-2xl">💬</p>
                <p className="text-sm font-medium text-foreground">
                  Select a conversation to begin
                </p>
                <p className="text-xs text-muted-foreground">
                  {rows.length > 0
                    ? `${counts.needsAgent > 0 ? `${counts.needsAgent} conversations need attention` : `${rows.length} conversations in queue`}`
                    : "No open conversations right now."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
