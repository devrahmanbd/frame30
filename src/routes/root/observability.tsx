/**
 * Phase 13 — one page that answers "is the platform's own plumbing healthy?".
 *
 * Connection forms only ever take a URL: credentials stay in the server's
 * environment, and the page shows whether the variable is present, never its
 * value. Every card carries live status, latency, 30-day uptime and a deep link
 * into the service's own UI.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  disconnectIntegrationFn,
  loadIntegrationsFn,
  loadOpsSignalsFn,
  saveIntegrationFn,
  testIntegrationFn,
} from "@/lib/integrations.functions";
import {
  composeCommand,
  costNote,
  formatSignal,
  signalTone,
  SIGNAL_SPECS,
  deepLink,
  envBlock,
  overallIntegrationStatus,
  SERVICE_CATALOG,
  STATUS_TONE,
  validBaseUrl,
  type IntegrationService,
  type ProbeStatus,
} from "@/lib/integrations";
import { ownerTrafficFn } from "@/lib/owner.functions";
import { OwnerHeader, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/observability")({
  head: () => ({
    meta: [
      { title: "Observability integrations — Framique owner console" },
      {
        name: "description",
        content:
          "Connect self-hosted Supabase, Prometheus, Loki, Grafana, Alertmanager, GlitchTip and Sentry, and watch their health in one page.",
      },
      { property: "og:title", content: "Observability integrations — Framique owner console" },
      {
        property: "og:description",
        content: "Health, latency and 30-day uptime for every self-hosted service behind Framique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ObservabilityDesk,
});

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const field = "w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm";

const STATUS_WORD: Record<ProbeStatus, string> = {
  up: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Not checked",
};

function ObservabilityDesk() {
  const qc = useQueryClient();
  const load = useServerFn(loadIntegrationsFn);
  const save = useServerFn(saveIntegrationFn);
  const test = useServerFn(testIntegrationFn);
  const disconnect = useServerFn(disconnectIntegrationFn);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [wizard, setWizard] = useState<IntegrationService[]>([]);
  const loadSignals = useServerFn(loadOpsSignalsFn);

  const signalsQ = useQuery({
    queryKey: ["root", "integration-signals"],
    queryFn: () => loadSignals(),
    refetchInterval: 60_000,
  });

  const q = useQuery({
    queryKey: ["root", "integrations"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });
  const services = q.data?.services ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["root", "integrations"] });

  const connected = services.filter((s) => s.connected);
  const overall = overallIntegrationStatus(connected.map((s) => s.status as ProbeStatus));
  const slowest = useMemo(
    () => connected.reduce((max, s) => Math.max(max, s.latencyMs ?? 0), 0),
    [connected],
  );

  const saveM = useMutation({
    mutationFn: (v: { service: IntegrationService; baseUrl: string }) => save({ data: v }),
    onSuccess: () => {
      toast.success("Connection saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testM = useMutation({
    mutationFn: (service: IntegrationService) => test({ data: { service } }),
    onSuccess: (r) => {
      if (r.status === "up") toast.success(`${SERVICE_CATALOG[r.service].label} answered in ${r.latencyMs} ms`);
      else toast.error(`${SERVICE_CATALOG[r.service].label}: ${r.error ?? r.status}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dropM = useMutation({
    mutationFn: (service: IntegrationService) => disconnect({ data: { service } }),
    onSuccess: () => {
      toast.success("Disconnected");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-6">
      <OwnerHeader
        title="Observability integrations"
        subtitle="Connect the self-hosted services Framique depends on and see their health in one place."
      />

      <StatGrid>
        <StatCard label="Overall" value={STATUS_WORD[overall]} />
        <StatCard label="Connected" value={`${connected.length} / ${services.length}`} />
        <StatCard label="Healthy now" value={String(connected.filter((s) => s.status === "up").length)} />
        <StatCard label="Slowest probe" value={slowest ? `${slowest} ms` : "—"} />
      </StatGrid>

      <section className="space-y-2 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">Health strip</h3>
        <p className="text-xs text-muted-foreground">
          Polled on the server every minute; no credential ever reaches this page.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(signalsQ.data?.signals ?? []).map((signal) => {
            const spec = SIGNAL_SPECS[signal.key];
            const tone = signalTone(signal.key, signal.value);
            return (
              <div key={signal.key} className="rounded-fq-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{spec.label}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatSignal(signal.key, signal.value)}
                  </span>
                  <StatePill tone={tone}>{tone === "ok" ? "OK" : tone === "warn" ? "Check" : "Bad"}</StatePill>
                </dd>
                {signal.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">{signal.detail}</p>
                ) : null}
              </div>
            );
          })}
        </dl>
      </section>

      {q.isError ? (
        <p className="rounded-fq-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Could not read the integration list. You need platform-owner access for this page.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {services.map((s) => {
          const spec = SERVICE_CATALOG[s.service];
          const draft = drafts[s.service] ?? s.baseUrl;
          const urlOk = validBaseUrl(draft);
          return (
            <article key={s.service} className="space-y-3 rounded-fq-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{s.label}</h3>
                  <p className="text-xs text-muted-foreground">{s.purpose}</p>
                </div>
                <StatePill tone={STATUS_TONE[s.status as ProbeStatus]}>
                  {STATUS_WORD[s.status as ProbeStatus]}
                </StatePill>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Latency</dt>
                  <dd className="tabular-nums">{s.latencyMs != null ? `${s.latencyMs} ms` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Uptime 30d</dt>
                  <dd className="tabular-nums">{s.uptime30d != null ? `${s.uptime30d}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd>{s.checkedAt ? new Date(s.checkedAt).toLocaleTimeString() : "never"}</dd>
                </div>
              </dl>

              {s.error ? <p className="text-xs text-destructive">{s.error}</p> : null}

              <label className="block space-y-1 text-xs">
                <span className="font-medium">Base URL</span>
                <input
                  className={field}
                  value={draft}
                  aria-label={`${s.label} base URL`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.service]: e.target.value }))}
                  placeholder={spec.defaultUrl}
                />
              </label>

              <p className="text-xs text-muted-foreground">
                {spec.credentialEnv ? (
                  <>
                    Credential comes from <code>{spec.credentialEnv}</code> on the server —{" "}
                    {s.credentialPresent ? "set" : "not set yet"}. It is never shown here.
                  </>
                ) : (
                  "No credential needed; keep this service on the private network."
                )}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={!urlOk || saveM.isPending}
                  onClick={() => saveM.mutate({ service: s.service, baseUrl: draft })}
                >
                  {s.connected ? "Save" : "Connect"}
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={!s.connected || testM.isPending}
                  onClick={() => testM.mutate(s.service)}
                >
                  Test connection
                </button>
                <a className={btn} href={deepLink(draft, s.service)} target="_blank" rel="noreferrer noopener">
                  Open {s.label}
                </a>
                {s.connected ? (
                  <button
                    type="button"
                    className={btn}
                    disabled={dropM.isPending}
                    onClick={() => dropM.mutate(s.service)}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>

              {s.history.length > 0 ? (
                <div className="flex gap-0.5" aria-label={`${s.label} recent checks`}>
                  {s.history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <span
                        key={`${h.checked_at}-${i}`}
                        title={`${h.status} — ${new Date(h.checked_at).toLocaleString()}`}
                        className={`h-4 w-1.5 rounded-fq-sm ${
                          h.status === "up"
                            ? "bg-primary/70"
                            : h.status === "degraded"
                              ? "bg-muted-foreground/50"
                              : "bg-destructive/70"
                        }`}
                      />
                    ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="space-y-3 rounded-fq-md border border-border p-4">
        <h3 className="text-sm font-semibold">Setup wizard</h3>
        <p className="text-xs text-muted-foreground">
          Pick the services you want to run, then copy the environment block and the start command.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.values(SERVICE_CATALOG).map((spec) => {
            const on = wizard.includes(spec.key);
            return (
              <button
                key={spec.key}
                type="button"
                aria-pressed={on}
                className={`${btn} ${on ? "bg-muted" : ""}`}
                onClick={() =>
                  setWizard((w) => (on ? w.filter((k) => k !== spec.key) : [...w, spec.key]))
                }
              >
                {spec.label}
              </button>
            );
          })}
        </div>
        {wizard.length > 0 ? (
          <div className="space-y-2">
            <pre className="overflow-x-auto rounded-fq-md bg-muted p-3 text-xs">{envBlock(wizard)}</pre>
            <pre className="overflow-x-auto rounded-fq-md bg-muted p-3 text-xs">{composeCommand(wizard)}</pre>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {costNote(wizard).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <PlatformTraffic />
    </section>
  );
}

/** Platform-wide traffic: visitors, clicks, orders, top countries, top stores. */
function PlatformTraffic() {
  const [days, setDays] = useState(30);
  const load = useServerFn(ownerTrafficFn);
  const { data, error } = useQuery({
    queryKey: ["root", "traffic", days],
    queryFn: () => load({ data: { days } }),
    placeholderData: (prev) => prev,
  });

  return (
    <section className="space-y-3 rounded-fq-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Traffic across every store</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              className={`${btn} ${days === d ? "bg-muted" : ""}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {(error as Error).message}
        </p>
      ) : null}

      {data ? (
        <>
          <StatGrid>
            <StatCard label="Visitors" value={data.totals.visitors.toLocaleString()} />
            <StatCard label="Sessions" value={data.totals.sessions.toLocaleString()} />
            <StatCard label="Clicks" value={data.totals.clicks.toLocaleString()} />
            <StatCard label="Orders" value={data.totals.orders.toLocaleString()} />
            <StatCard label="Stores reporting" value={String(data.storesReporting)} />
          </StatGrid>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium">Top countries</p>
              {data.countries.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No location data yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border text-xs">
                  {data.countries.map((c) => (
                    <li key={c.key} className="flex justify-between gap-3 py-1">
                      <span>{c.key}</span>
                      <span className="fq-num text-muted-foreground">{c.visitors.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-medium">Busiest stores</p>
              {data.stores.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No store traffic yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border text-xs">
                  {data.stores.map((s) => (
                    <li key={s.id} className="flex justify-between gap-3 py-1">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="fq-num text-muted-foreground">{s.visitors.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
