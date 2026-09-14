/**
 * Alert delivery (§9.3).
 *
 * Alert rules already exist as YAML under `ops/observability/`, but a rule with
 * no receiver is a comment. This module is the receiver: it takes an alert
 * intent, decides whether it is worth waking someone, and delivers it to every
 * enabled channel with the same discipline the payment code uses — dedupe,
 * cooldown, bounded retries with jitter, per-attempt ledger row, hard timeout,
 * and metrics on every outcome.
 *
 * Deliberate design choices:
 *
 *   - **Never throw into the caller.** An alert failing must not fail the job
 *     that raised it; delivery problems are recorded and counted instead.
 *   - **Cooldown is per dedupe key per channel.** A job that flaps every minute
 *     produces one page, then silence until the cooldown elapses, so on-call
 *     trust survives.
 *   - **Env channel is a fallback, not a bypass.** `OPS_ALERT_WEBHOOK_URL` gives
 *     a fresh deployment a receiver before anyone opens the console; database
 *     channels take precedence and can disable it by existing.
 *   - **Bodies are scrubbed.** Alerts travel to third-party chat systems, so
 *     they go through the same PII scrubber as the ops console.
 */
import { incr, log, observe, captureError } from "./observability.server";
import { scrubText } from "./ops";
import type { CronSeverity } from "./cron-registry";

export type AlertChannel = {
  id: string | null;
  key: string;
  label: string;
  kind: "webhook" | "slack";
  target: string;
  minSeverity: CronSeverity;
  cooldownSeconds: number;
  enabled: boolean;
};

export type AlertInput = {
  severity: CronSeverity;
  title: string;
  body: string;
  source: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  /** Set by the synthetic test path so real on-call knows it is a drill. */
  synthetic?: boolean;
};

export type AlertResult = {
  dedupeKey: string;
  attempted: number;
  delivered: number;
  suppressed: number;
  failed: number;
  channels: { key: string; status: "sent" | "failed" | "suppressed"; detail?: string }[];
};

const SEVERITY_RANK: Record<CronSeverity, number> = { info: 1, warning: 2, critical: 3 };
const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}

function envChannel(): AlertChannel | null {
  const url = process.env["OPS_ALERT_WEBHOOK_URL"];
  if (!url) return null;
  const min = (process.env["OPS_ALERT_MIN_SEVERITY"] ?? "warning") as CronSeverity;
  return {
    id: null,
    key: "env-webhook",
    label: "Deployment webhook",
    kind: url.includes("hooks.slack.com") ? "slack" : "webhook",
    target: url,
    minSeverity: SEVERITY_RANK[min] ? min : "warning",
    cooldownSeconds: Number(process.env["OPS_ALERT_COOLDOWN_SECONDS"] ?? 900) || 900,
    enabled: true,
  };
}

/** Channels the router will consider, database first, env fallback last. */
export async function loadAlertChannels(): Promise<AlertChannel[]> {
  const out: AlertChannel[] = [];
  try {
    const a = await admin();
    const { data } = await a
      .from("ops_alert_channels")
      .select("id, key, label, kind, target, min_severity, cooldown_seconds, enabled")
      .eq("enabled", true);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        id: String(row["id"]),
        key: String(row["key"]),
        label: String(row["label"]),
        kind: (String(row["kind"]) === "slack" ? "slack" : "webhook") as AlertChannel["kind"],
        target: String(row["target"]),
        minSeverity: (String(row["min_severity"] ?? "warning") as CronSeverity) ?? "warning",
        cooldownSeconds: Number(row["cooldown_seconds"] ?? 900),
        enabled: Boolean(row["enabled"]),
      });
    }
  } catch (err) {
    log("warn", "alerts.channels_unreadable", { message: (err as Error)?.message });
  }
  const env = envChannel();
  if (env && !out.some((c) => c.target === env.target)) out.push(env);
  return out;
}

/** True when this key already went out to this channel inside the cooldown. */
async function withinCooldown(channel: AlertChannel, dedupeKey: string): Promise<boolean> {
  try {
    const a = await admin();
    const since = new Date(Date.now() - channel.cooldownSeconds * 1000).toISOString();
    const q = a
      .from("ops_alert_deliveries")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .eq("status", "sent")
      .gte("created_at", since)
      .limit(1);
    const { data } = await (channel.id ? q.eq("channel_id", channel.id) : q.is("channel_id", null));
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Never let a ledger read decide to swallow a critical page.
    return false;
  }
}

async function ledger(row: Record<string, unknown>): Promise<string | null> {
  try {
    const a = await admin();
    const { data } = await a.from("ops_alert_deliveries").insert(row as never).select("id").single();
    return (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    log("error", "alerts.ledger_write_failed", { message: (err as Error)?.message });
    return null;
  }
}

async function ledgerUpdate(id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  try {
    const a = await admin();
    await a.from("ops_alert_deliveries").update(patch as never).eq("id", id);
  } catch {
    /* the alert already went out; the ledger is best-effort from here */
  }
}

function renderPayload(channel: AlertChannel, input: AlertInput) {
  const title = scrubText(input.title).slice(0, 300);
  const body = scrubText(input.body).slice(0, 3500);
  const prefix = input.synthetic ? "[SYNTHETIC DRILL] " : "";
  if (channel.kind === "slack") {
    return {
      text: `${prefix}${title}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `${prefix}${title}`.slice(0, 150) } },
        { type: "section", text: { type: "mrkdwn", text: `\`\`\`${body}\`\`\`` } },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `*severity* ${input.severity}` },
            { type: "mrkdwn", text: `*source* ${input.source}` },
          ],
        },
      ],
    };
  }
  return {
    severity: input.severity,
    title: `${prefix}${title}`,
    body,
    source: input.source,
    dedupe_key: input.dedupeKey,
    synthetic: Boolean(input.synthetic),
    payload: input.payload ?? {},
    sent_at: new Date().toISOString(),
  };
}

async function postOnce(channel: AlertChannel, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(channel.target, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "framique-alerts/1" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    observe("framique_alert_delivery_ms", Date.now() - started, { channel: channel.key });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false as const, status: res.status, error: text || `http_${res.status}` };
    }
    return { ok: true as const, status: res.status };
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return { ok: false as const, status: 0, error: aborted ? "timeout" : String((err as Error)?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/** 4xx other than 429 will never succeed on retry; everything else is worth one more go. */
function retryable(status: number) {
  if (status === 0) return true;
  if (status === 429) return true;
  return status >= 500;
}

/**
 * Routes one alert. Returns a per-channel report and never throws — the caller
 * is usually a failing job and must not fail twice.
 */
export async function emitAlert(input: AlertInput): Promise<AlertResult> {
  const result: AlertResult = {
    dedupeKey: input.dedupeKey,
    attempted: 0,
    delivered: 0,
    suppressed: 0,
    failed: 0,
    channels: [],
  };
  let channels: AlertChannel[] = [];
  try {
    channels = await loadAlertChannels();
  } catch (err) {
    void captureError(err, { scope: "alerts.load_channels" });
  }

  if (!channels.length) {
    incr("framique_alert_total", { outcome: "no_channel", severity: input.severity });
    log("warn", "alerts.no_channel", { source: input.source, title: input.title });
    await ledger({
      channel_id: null,
      dedupe_key: input.dedupeKey,
      severity: input.severity,
      title: scrubText(input.title).slice(0, 300),
      body: scrubText(input.body).slice(0, 3500),
      source: input.source,
      status: "failed",
      attempts: 0,
      last_error: "no_channel_configured",
      payload: input.payload ?? {},
    });
    return result;
  }

  for (const channel of channels) {
    if (SEVERITY_RANK[input.severity] < SEVERITY_RANK[channel.minSeverity]) {
      result.suppressed += 1;
      result.channels.push({ key: channel.key, status: "suppressed", detail: "below_min_severity" });
      continue;
    }
    if (!input.synthetic && (await withinCooldown(channel, input.dedupeKey))) {
      result.suppressed += 1;
      result.channels.push({ key: channel.key, status: "suppressed", detail: "cooldown" });
      incr("framique_alert_total", { outcome: "suppressed", severity: input.severity });
      await ledger({
        channel_id: channel.id,
        dedupe_key: input.dedupeKey,
        severity: input.severity,
        title: scrubText(input.title).slice(0, 300),
        body: null,
        source: input.source,
        status: "suppressed",
        attempts: 0,
        payload: { reason: "cooldown", cooldown_seconds: channel.cooldownSeconds },
      });
      continue;
    }

    const rowId = await ledger({
      channel_id: channel.id,
      dedupe_key: input.dedupeKey,
      severity: input.severity,
      title: scrubText(input.title).slice(0, 300),
      body: scrubText(input.body).slice(0, 3500),
      source: input.source,
      status: "pending",
      attempts: 0,
      payload: input.payload ?? {},
    });

    const body = renderPayload(channel, input);
    let lastError = "unknown";
    let lastStatus = 0;
    let sent = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt += 1) {
      result.attempted += 1;
      const out = await postOnce(channel, body);
      lastStatus = out.status;
      if (out.ok) {
        sent = true;
        await ledgerUpdate(rowId, {
          status: "sent",
          attempts: attempt,
          http_status: out.status,
          sent_at: new Date().toISOString(),
        });
        break;
      }
      lastError = out.error ?? "unknown";
      if (!retryable(out.status) || attempt === MAX_ATTEMPTS) break;
      // Exponential backoff with jitter: 400ms, 1.2s.
      const wait = 400 * 3 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, wait));
    }

    if (sent) {
      result.delivered += 1;
      result.channels.push({ key: channel.key, status: "sent" });
      incr("framique_alert_total", { outcome: "sent", severity: input.severity });
      if (channel.id) {
        try {
          const a = await admin();
          await a
            .from("ops_alert_channels")
            .update({ last_delivery_at: new Date().toISOString(), last_error: null } as never)
            .eq("id", channel.id);
        } catch {
          /* non-fatal */
        }
      }
    } else {
      result.failed += 1;
      result.channels.push({ key: channel.key, status: "failed", detail: lastError });
      incr("framique_alert_total", { outcome: "failed", severity: input.severity });
      log("error", "alerts.delivery_failed", {
        channel: channel.key,
        status: lastStatus,
        error: lastError,
      });
      await ledgerUpdate(rowId, {
        status: "failed",
        attempts: MAX_ATTEMPTS,
        http_status: lastStatus || null,
        last_error: lastError.slice(0, 500),
      });
      if (channel.id) {
        try {
          const a = await admin();
          await a
            .from("ops_alert_channels")
            .update({ last_error: lastError.slice(0, 500) } as never)
            .eq("id", channel.id);
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  return result;
}

/**
 * Proof that the pipe works. Bypasses cooldown (a drill that gets deduped
 * proves nothing) but is clearly marked so on-call does not open an incident.
 */
export async function sendSyntheticAlert(actor: string) {
  const stamp = new Date().toISOString();
  return emitAlert({
    severity: "critical",
    title: "Framique alerting drill",
    body: [
      "This is a synthetic alert raised from the owner console.",
      "If you can read it, the on-call channel is wired correctly.",
      `Raised by: ${actor}`,
      `At: ${stamp}`,
      "No action is required.",
    ].join("\n"),
    source: "ops.synthetic",
    dedupeKey: `synthetic:${stamp}`,
    synthetic: true,
    payload: { drill: true, actor },
  });
}

export type AlertDeliveryRow = {
  id: string;
  dedupe_key: string;
  severity: string;
  title: string;
  source: string | null;
  status: string;
  attempts: number;
  http_status: number | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export async function loadAlertHistory(limit = 40): Promise<AlertDeliveryRow[]> {
  const a = await admin();
  const { data } = await a
    .from("ops_alert_deliveries")
    .select(
      "id, dedupe_key, severity, title, source, status, attempts, http_status, last_error, created_at, sent_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  return (data ?? []) as AlertDeliveryRow[];
}