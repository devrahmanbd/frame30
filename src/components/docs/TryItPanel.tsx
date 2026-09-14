import { useState } from "react";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { docsTryItFn } from "@/lib/docs.functions";
import { apiRouteByKey, curlSample } from "@/lib/docs";

type State =
  | { phase: "idle" }
  | { phase: "running" }
  | {
      phase: "done";
      status: number;
      ok: boolean;
      simulated: boolean;
      durationMs: number;
      body: string | null;
      remaining: number;
      error?: string;
    }
  | { phase: "error"; message: string; resetAt: string | null };

/**
 * Runs one read-only endpoint against the sandbox tenant.
 *
 * The panel is deliberately modest about what it is: the server refuses
 * anything that is not a parameterless GET, and when no sandbox credential is
 * configured the response is labelled "recorded" rather than dressed up as a
 * live call. Documentation that lies about whether it just talked to a server
 * is worse than documentation with no button at all.
 */
export function TryItPanel({ routeKey }: { routeKey: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const route = apiRouteByKey(routeKey);
  if (!route) return null;

  const run = async () => {
    setState({ phase: "running" });
    try {
      const response = await docsTryItFn({ data: { route: routeKey, limit: 3 } });
      if (!response.ok) {
        setState({ phase: "error", message: response.message, resetAt: response.resetAt ?? null });
        return;
      }
      const r = response.result;
      setState({
        phase: "done",
        status: r.status,
        ok: r.ok,
        simulated: r.simulated,
        durationMs: r.durationMs,
        body: r.body,
        remaining: r.remaining,
        ...(r.error ? { error: r.error } : {}),
      });
    } catch {
      // A network failure on the docs site must not look like an API failure.
      setState({
        phase: "error",
        message: "Could not reach the docs server. Your own integration is unaffected.",
        resetAt: null,
      });
    }
  };

  return (
    <section className="my-8 rounded-fq-md border border-border bg-card p-4" aria-label="Try this endpoint">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-fq-md bg-info-soft px-2 py-1 font-mono text-xs font-semibold text-info">
            {route.method}
          </span>
          <code className="font-mono text-sm">/{route.pattern}</code>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state.phase === "running"}
          className="min-h-11 rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {state.phase === "running" ? "Running…" : "Run in sandbox"}
        </button>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">
        Read-only, against a demo store. Requires <code className="font-mono">{route.scope}</code> on a real
        credential.
      </p>

      <div aria-live="polite">
        {state.phase === "error" && (
          <p className="mt-4 rounded-fq-md border border-danger bg-danger-soft p-3 text-sm">
            {state.message}
            {state.resetAt && ` Resets ${new Date(state.resetAt).toLocaleTimeString()}.`}
          </p>
        )}

        {state.phase === "done" && (
          <div className="mt-4 space-y-2">
            <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className={state.ok ? "font-semibold text-success" : "font-semibold text-danger"}>
                {state.status}
              </span>
              <span>{state.durationMs} ms</span>
              {state.simulated && (
                <span className="rounded-fq-md bg-warning-soft px-2 py-0.5 text-warning-foreground">
                  Recorded response — no sandbox credential is configured
                </span>
              )}
              <span>{state.remaining} sandbox calls left</span>
            </p>
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            {state.body && <CodeBlock code={state.body} lang="json" label="sandbox response" />}
          </div>
        )}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">Same call as curl</summary>
        <CodeBlock code={curlSample(route)} lang="bash" label="curl sample" />
      </details>
    </section>
  );
}
