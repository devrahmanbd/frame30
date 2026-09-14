import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { RootCommandPalette } from "./RootCommandPalette";

type Item = { to: LinkProps["to"]; label: string };
type Group = { heading: string; items: Item[] };

const tab =
  "block rounded-fq-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const active = "bg-primary/10 text-primary";

/**
 * Owner console shell. Owns its own chrome end-to-end — it shares no layout,
 * navigation or header component with AdminShell, so a merchant-console change
 * can never alter what a platform owner sees (and vice versa).
 */
export function RootShell({ children }: { children: ReactNode }) {
  const { tk } = useLang();
  const qc = useQueryClient();
  const aiData = qc.getQueryData<{ counts?: { needsAgent?: number } }>(["owner-ai"]);
  const needsAgentCount = aiData?.counts?.needsAgent ?? 0;

  const groups: Group[] = [
    {
      heading: tk("owner.revenue"),
      items: [
        { to: "/root", label: tk("platform.console") },
        { to: "/root/revenue", label: tk("owner.revenue") },
        { to: "/root/plans", label: tk("platform.plans_and_limits") },
        { to: "/root/trial", label: tk("owner.trial") },
        { to: "/root/coupons", label: tk("owner.coupons") },
      ],
    },
    {
      heading: tk("platform.tenants"),
      items: [
        { to: "/root/tenants", label: tk("platform.tenants") },
        { to: "/root/tenancy", label: tk("tenancy") },
        { to: "/root/users", label: tk("owner.users") },
      ],
    },
    {
      heading: tk("money"),
      items: [
        { to: "/root/money", label: tk("money") },
        { to: "/root/payouts", label: tk("owner.payouts") },
        { to: "/root/gateway", label: tk("platform.gateway") },
      ],
    },
    {
      heading: tk("owner.fraud"),
      items: [
        { to: "/root/fraud", label: tk("owner.fraud") },
        { to: "/root/ai", label: tk("owner.ai") },
        { to: "/root/marketing", label: tk("owner.marketing") },
      ],
    },
    {
      heading: tk("owner.ops"),
      items: [
        { to: "/root/ops", label: tk("owner.ops") },
        { to: "/root/snapshots", label: tk("owner.snapshots") },
        { to: "/root/status", label: tk("owner.status") },
        { to: "/root/observability", label: tk("owner.observability") },
        { to: "/root/access", label: tk("owner.access") },
        { to: "/root/audit", label: tk("owner.audit") },
        { to: "/root/settings", label: tk("owner.settings") },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#root-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-fq-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {tk("common.skip_to_content")}
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-fq-sm bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              root
            </span>
            <h1 className="text-sm font-semibold text-foreground">{tk("platform.console")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {tk("owner.cross_tenant_notice")}
            </p>
            <RootCommandPalette
              destinations={groups.flatMap((g) =>
                g.items.map((i) => ({ to: i.to, label: i.label, group: g.heading })),
              )}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label={tk("platform.console")} className="space-y-4">
          {groups.map((g) => (
            <div key={g.heading}>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.heading}
              </p>
              <div className="space-y-1">
                {g.items.map((l) => {
                  const isAiTab = l.to === "/root/ai";
                  return (
                    <Link
                      key={l.to as string}
                      to={l.to}
                      activeOptions={{ exact: l.to === "/root" }}
                      className={`flex items-center justify-between ${tab}`}
                      activeProps={{ className: `flex items-center justify-between ${tab} ${active}`, "aria-current": "page" }}
                    >
                      <span>{l.label}</span>
                      {isAiTab && needsAgentCount > 0 ? (
                        <span
                          id="nav-badge-ai-needs-agent"
                          className="inline-flex items-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground animate-pulse"
                          aria-label={`${needsAgentCount} conversations need attention`}
                        >
                          {needsAgentCount}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <main id="root-main" tabIndex={-1} className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
