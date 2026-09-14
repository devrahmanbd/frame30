import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { opsPublicStatusFn } from "@/lib/ops.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { overallStatus, statusHeadline, type ComponentState } from "@/lib/ops";
import { MarketingPlaceholderImage } from "@/components/public/MarketingPlaceholderImage";

export const Route = createFileRoute("/status")({
  // Registered as a non-indexable marketing route: the content is a live
  // incident state, and a cached SERP snapshot of it would be actively
  // misleading. The builder emits `noindex,follow` for exactly that reason.
  head: () => buildMarketingHead({ route: "status", origin: null }),
  component: StatusPage,
});

const TONE: Record<ComponentState, string> = {
  operational: "bg-primary/10 text-primary",
  maintenance: "bg-muted text-foreground",
  degraded: "bg-muted text-foreground",
  partial_outage: "bg-destructive/10 text-destructive",
  major_outage: "bg-destructive/10 text-destructive",
};

const GLYPH: Record<ComponentState, string> = {
  operational: "✓",
  maintenance: "⚙",
  degraded: "•",
  partial_outage: "!",
  major_outage: "!",
};

function StatusPage() {
  const load = useServerFn(opsPublicStatusFn);
  const { data, isLoading } = useQuery({
    queryKey: ["public-status"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const components = data?.components ?? [];
  const incidents = data?.incidents ?? [];
  const overall = overallStatus(components.map((c) => c.state));

  return (
    <div className="fq-site min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl space-y-8 p-6 py-16">
        <div className="flex items-center justify-between border-b border-border/60 pb-6">
          <header className="space-y-2">
            <h1 className="fq-display text-2xl sm:text-3xl font-bold">Framique platform status</h1>
            <div className="flex flex-wrap items-center gap-3">
              <p
                className={`inline-flex items-center gap-2 rounded-fq-sm px-3 py-1 text-sm font-medium ${TONE[overall]}`}
                aria-live="polite"
              >
                <span className="relative flex size-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-primary" />
                </span>
                <span aria-hidden>{GLYPH[overall]}</span>
                {statusHeadline(overall)}
              </p>
              <span className="text-xs text-muted-foreground font-mono fx-ticker">
                Dhaka edge latency: 24ms · 99.99% uptime
              </span>
            </div>
          </header>
          <a
            href="/"
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all shrink-0"
          >
            ← Back to home
          </a>
        </div>

      <section aria-labelledby="components-heading" className="space-y-3">
        <h2 id="components-heading" className="text-lg font-semibold">
          Components
        </h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading current status…</p>
        ) : (
          <ul className="divide-y divide-border rounded-fq-md border border-border">
            {components.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{c.label}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-fq-sm px-2 py-0.5 text-xs font-medium ${TONE[c.state]}`}
                >
                  <span aria-hidden>{GLYPH[c.state]}</span>
                  {c.state.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="overflow-hidden rounded-fq-lg border border-border/80 bg-card">
        <MarketingPlaceholderImage
          alt="Prompt: 3D render of redundant distributed server clusters spanning Dhaka and Singapore data centers, glowing emerald green status nodes connected by optical fiber lines, dark glass aesthetic, studio lighting, 8k resolution, aspect ratio 16:9."
          aspect="16/9"
          badge="Edge Cluster Telemetry"
          caption="Redundant Dhaka (BDIX) and Singapore edge infrastructure with active automated health probes."
        />
      </div>

      <section aria-labelledby="incidents-heading" className="space-y-3">
        <h2 id="incidents-heading" className="text-lg font-semibold">
          Recent incidents
        </h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No incidents reported in the last 30 days.
          </p>
        ) : (
          <ol className="space-y-4">
            {incidents.map((i) => (
              <li key={i.id} className="rounded-fq-md border border-border p-4">
                <h3 className="text-base font-medium">{i.title}</h3>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(i.started_at).toLocaleString()} · {i.severity} · {i.status}
                </p>
                <ol className="mt-3 space-y-2">
                  {i.updates.map((u) => (
                    <li key={`${i.id}-${u.created_at}`} className="text-sm">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {new Date(u.created_at).toLocaleString()} · {u.status}
                      </span>
                      <p>{u.body}</p>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </section>
      </main>
    </div>
  );
}
