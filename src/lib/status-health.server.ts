/**
 * Status-page truthfulness (§9.3).
 *
 * `/status` used to render whatever `ops_status_components.state` happened to
 * contain, which meant it was optimistic by default: nobody remembers to flip a
 * component to `degraded` during an incident they are busy fixing. This module
 * derives each component's state from signals the platform already records, then
 * writes it back, so the public page degrades on its own.
 *
 * Rules that keep it honest and non-annoying:
 *
 *   - **Manual maintenance wins.** An operator who declared a maintenance window
 *     keeps it; otherwise the signals decide, and they may not silently upgrade
 *     a component the signals still consider broken.
 *   - **Signals are conservative.** A single late job does not turn a component
 *     red; sustained failure or a stalled critical job does.
 *   - **Everything is logged.** A state change on the public page is an
 *     operational event, so it emits a metric and a log line with the reason.
 */
import { incr, log } from "./observability.server";
import { COMPONENT_STATES, type ComponentState } from "./ops";
import { evaluateFleet } from "./cron-ops.server";
import { OPS_OBJECTIVES } from "./cron-registry";

type Admin = { from: (table: string) => Record<string, (...args: unknown[]) => unknown> };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (table: string) => {
      select: (cols: string, opts?: Record<string, unknown>) => any;
      update: (patch: unknown) => { eq: (col: string, val: string) => Promise<unknown> };
    };
  };
}
void (null as unknown as Admin);

const RANK: Record<ComponentState, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

function worse(a: ComponentState, b: ComponentState): ComponentState {
  return RANK[a] >= RANK[b] ? a : b;
}

export type ComponentVerdict = {
  key: string;
  derived: ComponentState;
  previous: ComponentState;
  applied: ComponentState;
  reasons: string[];
};

/**
 * Builds a component -> state map from live signals: scheduled-job health,
 * dead-letter depth, backup-drill freshness and open public incidents.
 */
export async function deriveComponentStates(now = new Date()): Promise<{
  derived: Map<string, { state: ComponentState; reasons: string[] }>;
  signals: Record<string, unknown>;
}> {
  const derived = new Map<string, { state: ComponentState; reasons: string[] }>();
  const bump = (key: string, state: ComponentState, reason: string) => {
    const current = derived.get(key);
    if (!current) derived.set(key, { state, reasons: [reason] });
    else {
      current.reasons.push(reason);
      current.state = worse(current.state, state);
    }
  };

  // --- signal 1: scheduled jobs
  const fleet = await evaluateFleet(now);
  for (const view of fleet) {
    const critical = view.definition.severity === "critical";
    for (const component of view.definition.components) {
      if (view.health === "ok" || view.health === "running") continue;
      if (view.health === "paused") {
        bump(component, "maintenance", `${view.definition.key} is paused`);
      } else if (view.health === "failing" || view.health === "stalled") {
        bump(
          component,
          critical ? "partial_outage" : "degraded",
          `${view.definition.key} is ${view.health}`,
        );
      } else if (view.health === "late" || view.health === "never_run") {
        bump(
          component,
          critical ? "degraded" : "operational",
          `${view.definition.key} is ${view.health}`,
        );
      } else if (view.health === "slow") {
        bump(component, "operational", `${view.definition.key} is over its duration budget`);
      }
    }
  }

  const a = await admin();

  // --- signal 2: dead letters awaiting a human
  let dlqDepth = 0;
  try {
    const [payments, couriers] = (await Promise.all([
      a.from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
      a
        .from("courier_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter"),
    ])) as { count?: number }[];
    const pay = Number(payments?.count ?? 0);
    dlqDepth = pay + Number(couriers?.count ?? 0);
    if (dlqDepth >= 50) bump("webhooks", "partial_outage", `${dlqDepth} dead-lettered events`);
    else if (dlqDepth >= 10) bump("webhooks", "degraded", `${dlqDepth} dead-lettered events`);
    if (pay >= 25) bump("payments", "degraded", `${pay} payment events dead-lettered`);
  } catch (err) {
    log("warn", "status.dlq_signal_failed", { message: (err as Error)?.message });
  }

  // --- signal 3: backup drill freshness (we publish an RPO/RTO, so prove it)
  let lastDrillAt: string | null = null;
  try {
    const { lastPassedDrillAt } = await import("./backup-drill.server");
    lastDrillAt = await lastPassedDrillAt();
    const stale =
      !lastDrillAt ||
      now.getTime() - new Date(lastDrillAt).getTime() > OPS_OBJECTIVES.drillMaxAgeDays * 86_400_000;
    if (stale) bump("database", "degraded", "No verified restore drill inside the published window");
  } catch (err) {
    log("warn", "status.drill_signal_failed", { message: (err as Error)?.message });
  }

  // --- signal 4: open public incidents always win
  let openIncidents = 0;
  try {
    const { data } = (await a
      .from("ops_incidents")
      .select("severity, components, status")
      .neq("status", "resolved")
      .eq("is_public", true)) as { data: Record<string, unknown>[] | null };
    for (const row of data ?? []) {
      openIncidents += 1;
      const severity = String(row["severity"] ?? "minor");
      const state: ComponentState =
        severity === "critical"
          ? "major_outage"
          : severity === "major"
            ? "partial_outage"
            : "degraded";
      for (const component of (row["components"] as string[] | null) ?? []) {
        bump(component, state, `Open ${severity} incident`);
      }
    }
  } catch (err) {
    log("warn", "status.incident_signal_failed", { message: (err as Error)?.message });
  }

  return { derived, signals: { jobs: fleet.length, dlqDepth, lastDrillAt, openIncidents } };
}

/**
 * Applies the derivation to `ops_status_components`. Returns one verdict per
 * component so the nightly job's response is an audit trail of what moved.
 */
export async function refreshComponentHealth(now = new Date()) {
  const { derived, signals } = await deriveComponentStates(now);
  const a = await admin();
  const { data } = (await a.from("ops_status_components").select("key, state")) as {
    data: { key: string; state: string }[] | null;
  };
  const verdicts: ComponentVerdict[] = [];

  for (const row of data ?? []) {
    const previous = (COMPONENT_STATES as readonly string[]).includes(row.state)
      ? (row.state as ComponentState)
      : "operational";
    const hit = derived.get(row.key);
    const target = hit?.state ?? "operational";
    const applied = previous === "maintenance" ? "maintenance" : target;
    verdicts.push({ key: row.key, derived: target, previous, applied, reasons: hit?.reasons ?? [] });
    if (applied !== previous) {
      try {
        await a
          .from("ops_status_components")
          .update({ state: applied })
          .eq("key", row.key);
        incr("framique_status_component_changes_total", { component: row.key, state: applied });
        log("warn", "status.component_changed", {
          component: row.key,
          from: previous,
          to: applied,
          reasons: (hit?.reasons ?? []).join("; "),
        });
      } catch (err) {
        log("error", "status.component_write_failed", {
          component: row.key,
          message: (err as Error)?.message,
        });
      }
    }
  }

  try {
    const { invalidate } = await import("./cache.server");
    invalidate("ops.status");
  } catch {
    /* cache module is optional on this path */
  }

  return { verdicts, signals, changed: verdicts.filter((v) => v.applied !== v.previous).length };
}