/**
 * Owner-console command palette (⌘K / Ctrl-K).
 *
 * Deliberately its own component: it shares nothing with the merchant
 * `CommandPalette`, so a change to the admin palette can never alter how a
 * platform owner navigates. Three result kinds:
 *   • actions — quick operational shortcuts (kill-switches, DLQ, backups, payouts);
 *   • destinations — every `/root` surface, always available;
 *   • tenants — cross-tenant jump by store name, slug or plan.
 *
 * Tenant rows come from the same guarded owner query the tenants page uses, so
 * the palette can never see a tenant the owner is not allowed to see.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Sliders,
  CreditCard,
  Layers,
  ShieldCheck,
  Bot,
  Activity,
  HardDrive,
  Building2,
  ArrowRight,
} from "lucide-react";
import { platformTenantsFn } from "@/lib/platform.functions";
import { useLang } from "@/lib/i18n";

type Dest = { to: LinkProps["to"]; label: string; group: string };
type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  status: string;
};

const QUICK_ACTIONS = [
  {
    to: "/root/settings",
    label: "Emergency Controls & Kill Switches",
    group: "Emergency",
    icon: Sliders,
    keywords: "kill switch ai fraud circuit breaker settings pause halt",
  },
  {
    to: "/root/payouts",
    label: "Review Pending Merchant Payouts",
    group: "Financials",
    icon: CreditCard,
    keywords: "payouts settlement release hold money bank bkash nagad",
  },
  {
    to: "/root/ops",
    label: "Dead-Letter Queue (DLQ) & Webhook Replay",
    group: "Reliability",
    icon: Layers,
    keywords: "dlq dead letter replay supercronic bullmq jobs cron",
  },
  {
    to: "/root/access",
    label: "Consented Store Impersonation Desk",
    group: "Support",
    icon: ShieldCheck,
    keywords: "impersonation access grant support login token merchant",
  },
  {
    to: "/root/audit",
    label: "Privileged Platform Audit Stream",
    group: "Security",
    icon: Activity,
    keywords: "audit logs security ledger before after actor immutable",
  },
  {
    to: "/root/snapshots",
    label: "Database Backups & PITR Rehearsal",
    group: "Disaster Recovery",
    icon: HardDrive,
    keywords: "snapshots backups restore drill wal pitr postgres",
  },
  {
    to: "/root/ai",
    label: "Support Moderation & Human Takeover",
    group: "AI Support",
    icon: Bot,
    keywords: "ai chat conversation takeover chime customer message",
  },
];

export function RootCommandPalette({ destinations }: { destinations: Dest[] }) {
  const { tk, t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // The input mounts with the dialog, so focus on the next frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const loadTenants = useServerFn(platformTenantsFn);
  // Only fetched once the palette is actually opened.
  const tenants = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => loadTenants(),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    // 1. Actions matching query
    const actions = QUICK_ACTIONS.filter(
      (a) =>
        needle &&
        (a.label.toLowerCase().includes(needle) ||
          a.keywords.toLowerCase().includes(needle) ||
          a.group.toLowerCase().includes(needle)),
    ).map((a) => ({
      kind: "action" as const,
      key: `action:${a.to}`,
      to: a.to as LinkProps["to"],
      label: a.label,
      group: a.group,
      icon: a.icon,
    }));

    // 2. Destinations matching query or initial list
    const dests = destinations
      .filter(
        (d) =>
          !needle ||
          `${d.label} ${d.group} ${String(d.to)}`
            .toLowerCase()
            .includes(needle),
      )
      .slice(0, 8)
      .map((d) => ({ kind: "dest" as const, key: String(d.to), ...d }));

    // 3. Tenants matching query
    const rows = ((tenants.data?.tenants ?? []) as Tenant[])
      .filter(
        (t) =>
          needle &&
          `${t.name} ${t.slug} ${t.plan ?? ""}`.toLowerCase().includes(needle),
      )
      .slice(0, 6)
      .map((t) => ({
        kind: "tenant" as const,
        key: `tenant:${t.id}`,
        tenant: t,
      }));

    return [...actions, ...dests, ...rows];
  }, [destinations, needle, tenants.data]);

  const go = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    setOpen(false);
    if (hit.kind === "dest" || hit.kind === "action") {
      void navigate({ to: hit.to });
    } else {
      void navigate({
        to: "/root/tenants",
        search: { q: hit.tenant.slug },
      });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-fq-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      >
        <Search className="size-3.5" />
        <span>{tk("common.search")}</span>
        <kbd className="ml-1 rounded-fq-xs border border-border/80 bg-background px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs p-4 pt-20"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tk("platform.console")}
        className="w-full max-w-xl overflow-hidden rounded-fq-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground mr-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) =>
                  Math.min(c + 1, Math.max(results.length - 1, 0)),
                );
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                go(cursor);
              }
            }}
            placeholder={t(
              "Jump to desk, store name, slug, or quick action...",
              "ডেস্ক, স্টোরের নাম, স্ল্যাগ বা অ্যাকশন খুঁজুন...",
            )}
            aria-label={tk("common.search")}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <span className="rounded-fq-xs bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </span>
        </div>

        <ul className="max-h-84 overflow-y-auto p-1.5 divide-y divide-border/20">
          {results.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(i)}
                aria-current={i === cursor ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-3 rounded-fq-md px-3.5 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                  i === cursor ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                {r.kind === "action" ? (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-fq-sm bg-primary/10 text-primary">
                        <r.icon className="size-3.5" />
                      </div>
                      <span className="truncate font-medium text-foreground">
                        {r.label}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {r.group}
                    </span>
                  </>
                ) : r.kind === "dest" ? (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="truncate text-foreground font-medium">
                        {r.label}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.group}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-fq-sm bg-muted text-muted-foreground">
                        <Building2 className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="truncate font-medium text-foreground block">
                          {r.tenant.name}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          /{r.tenant.slug}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.tenant.plan ?? "launch"}</span>
                      <span className="text-border">·</span>
                      <span className="capitalize">{r.tenant.status}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                    </div>
                  </>
                )}
              </button>
            </li>
          ))}

          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {tenants.isPending && needle
                ? tk("common.loading")
                : tk("common.empty")}
            </li>
          ) : null}
        </ul>

        <div className="border-t border-border bg-muted/20 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Platform Root Search</span>
        </div>
      </div>
    </div>
  );
}
