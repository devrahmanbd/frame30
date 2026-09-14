import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import { gatewayEventsFn, gatewayRetryFn } from "@/lib/gateway.functions";

export const Route = createFileRoute("/root/gateway")({
  head: () => ({
    meta: [
      { title: "Payment gateway — Framique owner console" },
      {
        name: "description",
        content:
          "Inspect every payment provider callback Framique received, review dead-letter reasons and retry failed deliveries.",
      },
      { property: "og:title", content: "Payment gateway — Framique owner console" },
      {
        property: "og:description",
        content: "Webhook ingest log, dead-letter reasons and one-click retry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GatewayOps,
});

const chip = "inline-flex items-center gap-1 rounded-fq-sm px-2 py-0.5 text-xs font-medium";

function statusChip(status: string) {
  if (status === "processed") return `${chip} bg-primary/10 text-primary`;
  if (status === "dead_letter") return `${chip} bg-destructive/10 text-destructive`;
  return `${chip} bg-muted text-muted-foreground`;
}

function GatewayOps() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(gatewayEventsFn);
  const retry = useServerFn(gatewayRetryFn);

  const { data, isLoading } = useQuery({ queryKey: ["gateway-events"], queryFn: () => load() });

  const retryMutation = useMutation({
    mutationFn: (eventId: string) => retry({ data: { eventId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(tk("gateway.retry_ok"));
      else toast.error(`${tk("gateway.retry_failed")}: ${result.reason ?? result.status}`);
      void qc.invalidateQueries({ queryKey: ["gateway-events"] });
    },
    onError: () => toast.error(tk("gateway.retry_failed")),
  });

  const events = data?.events ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tk("gateway.title")}</h2>
        <p className="text-sm text-muted-foreground">{tk("gateway.subtitle")}</p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      {!isLoading && events.length === 0 ? (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {tk("gateway.empty")}
        </p>
      ) : null}

      <ul className="space-y-2" aria-live="polite">
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-fq-md border border-border p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <code className="font-mono text-xs text-muted-foreground">{event.webhook_id}</code>
              <span className={statusChip(event.status)}>
                <span aria-hidden>{event.status === "processed" ? "✓" : "!"}</span>
                {event.status === "processed"
                  ? tk("gateway.status_processed")
                  : event.status === "dead_letter"
                    ? tk("gateway.status_dead_letter")
                    : tk("gateway.status_received")}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
              <span>
                {event.provider} · {event.event_type}
              </span>
              <span>{event.merchantName ?? tk("gateway.no_merchant")}</span>
              <span className="tabular-nums">
                {event.amount_minor_int === null
                  ? "—"
                  : fmtMinor(event.amount_minor_int, event.currency_code)}
              </span>
              <span>{new Date(event.received_at).toLocaleString()}</span>
            </div>
            {event.reason ? (
              <p className="mt-2 text-xs font-medium text-destructive">
                {tk("gateway.reason")}: {event.reason} · {tk("gateway.redeliveries")}{" "}
                {event.redelivery_count}
              </p>
            ) : null}
            {event.status === "dead_letter" ? (
              <button
                type="button"
                className="mt-3 rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate(event.id)}
              >
                {tk("gateway.retry")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
