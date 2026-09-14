import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Phase 12 — GlitchTip/Sentry webhook -> Alertmanager bridge.
 *
 * Both error backends can post a webhook when an issue rule fires, but neither
 * speaks Alertmanager. This route translates one into the other so error
 * alerts land in the *same* Slack/PagerDuty path as every metric alert from
 * Phase 11 — one on-call surface, one silence mechanism.
 *
 * Security: the caller proves itself with a shared secret (constant-time
 * compare). With no secret configured the endpoint 404s, so an unconfigured
 * deploy exposes nothing. Nothing from the payload is echoed back.
 */
const payloadSchema = z.object({
  // GlitchTip and Sentry both send a title/message plus a web link.
  title: z.string().trim().min(1).max(300).optional(),
  message: z.string().trim().max(300).optional(),
  culprit: z.string().trim().max(200).optional(),
  level: z.string().trim().max(20).optional(),
  project: z.string().trim().max(80).optional(),
  url: z.string().url().max(500).optional(),
  web_url: z.string().url().max(500).optional(),
  source: z.enum(["glitchtip", "sentry"]).optional(),
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const NO_STORE = { "cache-control": "no-store" } as const;

export const Route = createFileRoute("/api/public/error-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["ERROR_ALERT_SECRET"];
        if (!secret) return new Response("Not found", { status: 404, headers: NO_STORE });

        const presented =
          request.headers.get("x-error-alert-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!presented || !safeEqual(presented, secret)) {
          return new Response("Unauthorized", { status: 401, headers: NO_STORE });
        }

        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400, headers: NO_STORE });
        }

        const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
        const source = parsed.source ?? (ua.includes("glitchtip") ? "glitchtip" : "sentry");
        const summary = parsed.title ?? parsed.message ?? "Error tracker issue";
        const link = parsed.url ?? parsed.web_url ?? "";
        const severity = (parsed.level ?? "error") === "fatal" ? "page" : "ticket";

        const alertmanager = process.env["ALERTMANAGER_URL"] ?? "http://alertmanager:9093";
        const body = [
          {
            labels: {
              alertname: "ErrorTrackerIssue",
              severity,
              team: "platform",
              source,
              ...(parsed.project ? { project: parsed.project.slice(0, 80) } : {}),
            },
            annotations: {
              summary: summary.slice(0, 300),
              description: parsed.culprit?.slice(0, 200) ?? "",
              issue_url: link,
              runbook: "docs/14-operations/runbooks.md#errortrackerissue",
            },
            startsAt: new Date().toISOString(),
            ...(link ? { generatorURL: link } : {}),
          },
        ];

        const { incr } = await import("@/lib/observability.server");
        try {
          const res = await fetch(`${alertmanager.replace(/\/$/, "")}/api/v2/alerts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          incr("framique_error_alert_bridge_total", { source, outcome: res.ok ? "sent" : `http_${res.status}` });
        } catch {
          incr("framique_error_alert_bridge_total", { source, outcome: "transport_error" });
        }
        return new Response(null, { status: 202, headers: NO_STORE });
      },
    },
  },
});
