import type { ReactNode } from "react";
import type { QueueDepth, QueueVerdict } from "@/lib/job-queue";

/**
 * Presentational layer for the infrastructure desk (§4.4). Pure rendering —
 * the route owns loading and mutations. Every panel answers a question an
 * on-call human actually asks: is work draining, did search fall back, and
 * can the store survive the traffic it is about to get.
 */

const verdictTone: Record<QueueVerdict["status"], string> = {
  healthy: "border-success bg-success-soft text-success-strong",
  backlogged: "border-warning bg-warning-soft text-warning-strong",
  stalled: "border-warning bg-warning-soft text-warning-strong",
  failing: "border-destructive bg-destructive/10 text-destructive",
};

export function StatusPill({ status }: { status: QueueVerdict["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${verdictTone[status]}`}>
      {status}
    </span>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-fq-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-fq-md border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export type QueueRow = QueueDepth & { verdict: QueueVerdict };

export function QueueTable({ rows, emptyLabel }: { rows: QueueRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <caption className="sr-only">Background queue depth and health</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Queue</th>
            <th scope="col" className="py-2 pr-3 font-medium">Health</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Waiting</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Running</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Gave up</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Oldest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.queue} className="border-b border-border/60">
              <td className="py-2 pr-3 font-medium">{r.queue}</td>
              <td className="py-2 pr-3">
                <StatusPill status={r.verdict.status} />
                <span className="ml-2 text-xs text-muted-foreground">{r.verdict.message}</span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.queued}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.running}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${r.dead > 0 ? "text-destructive" : ""}`}>
                {r.dead}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.oldestQueuedAgeSeconds > 0 ? `${Math.round(r.oldestQueuedAgeSeconds / 60)}m` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type JobRow = {
  id: string;
  queue: string;
  name: string;
  state: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
};

const stateTone: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-primary",
  succeeded: "text-success-strong",
  failed: "text-warning-strong",
  dead: "text-destructive",
  cancelled: "text-muted-foreground",
};

export function JobTable({
  rows,
  emptyLabel,
  busy,
  onReplay,
  onCancel,
}: {
  rows: JobRow[];
  emptyLabel: string;
  busy: boolean;
  onReplay: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Recent background jobs</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Job</th>
            <th scope="col" className="py-2 pr-3 font-medium">State</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Attempts</th>
            <th scope="col" className="py-2 pr-3 font-medium">Last error</th>
            <th scope="col" className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <span className="font-medium">{j.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{j.queue}</span>
              </td>
              <td className={`py-2 pr-3 font-medium ${stateTone[j.state] ?? ""}`}>{j.state}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {j.attempts}/{j.max_attempts}
              </td>
              <td className="max-w-[280px] truncate py-2 pr-3 text-xs text-muted-foreground">
                {j.last_error_message ?? j.last_error_code ?? "—"}
              </td>
              <td className="py-2 text-right">
                {j.state === "dead" || j.state === "failed" || j.state === "cancelled" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReplay(j.id)}
                    className="rounded-fq-sm border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    Replay
                  </button>
                ) : j.state === "queued" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancel(j.id)}
                    className="rounded-fq-sm border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type LoadTestRow = {
  id: string;
  scenario: string;
  concurrency: number;
  requests: number;
  failures: number;
  p95_ms: number;
  rps: number;
  verdict: string;
  created_at: string;
};

export function LoadTestTable({ rows, emptyLabel }: { rows: LoadTestRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <caption className="sr-only">Load test history</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Scenario</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Users</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Requests</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Failed</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">p95</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">RPS</th>
            <th scope="col" className="py-2 pr-3 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <span className="font-medium">{r.scenario}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.concurrency}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.requests}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${r.failures > 0 ? "text-destructive" : ""}`}>
                {r.failures}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.p95_ms}ms</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.rps}</td>
              <td className="py-2 pr-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    r.verdict === "pass"
                      ? "border-success bg-success-soft text-success-strong"
                      : r.verdict === "warn"
                        ? "border-warning bg-warning-soft text-warning-strong"
                        : "border-destructive bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.verdict}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
