/**
 * Owner-console command palette (⌘K / Ctrl-K).
 *
 * Deliberately its own component: it shares nothing with the merchant
 * `CommandPalette`, so a change to the admin palette can never alter how a
 * platform owner navigates. Two result kinds:
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
import { platformTenantsFn } from "@/lib/platform.functions";
import { useLang } from "@/lib/i18n";

type Dest = { to: LinkProps["to"]; label: string; group: string };
type Tenant = { id: string; name: string; slug: string; plan: string | null; status: string };

export function RootCommandPalette({ destinations }: { destinations: Dest[] }) {
  const { tk } = useLang();
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
    const dests = destinations
      .filter((d) => !needle || `${d.label} ${d.group} ${String(d.to)}`.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((d) => ({ kind: "dest" as const, key: String(d.to), ...d }));
    const rows = ((tenants.data?.tenants ?? []) as Tenant[])
      .filter((t) => needle && `${t.name} ${t.slug} ${t.plan ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((t) => ({ kind: "tenant" as const, key: `tenant:${t.id}`, tenant: t }));
    return [...dests, ...rows];
  }, [destinations, needle, tenants.data]);

  const go = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    setOpen(false);
    if (hit.kind === "dest") void navigate({ to: hit.to });
    else void navigate({ to: "/root/tenants", search: { q: hit.tenant.slug } });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        {tk("common.search")} <kbd className="ml-1 font-mono text-[10px]">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tk("platform.console")}
        className="w-full max-w-lg overflow-hidden rounded-fq-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
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
              setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
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
          placeholder="Owner pages, store name, slug or plan"
          aria-label={tk("common.search")}
          className="w-full border-b border-border bg-background px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(i)}
                aria-current={i === cursor ? "true" : undefined}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                  i === cursor ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                {r.kind === "dest" ? (
                  <>
                    <span className="min-w-0 truncate">{r.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{r.group}</span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 truncate">{r.tenant.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      /{r.tenant.slug} · {r.tenant.plan ?? "—"} · {r.tenant.status}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              {tenants.isPending && needle ? tk("common.loading") : tk("common.empty")}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
