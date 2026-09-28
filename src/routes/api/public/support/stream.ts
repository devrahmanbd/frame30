import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Public SSE streaming route for the storefront support widget.
 *
 * ANONYMOUS_PUBLIC_THREAT_MODEL (Rule 1/2): this lane is intentionally
 * unauthenticated. Reads stay open by design (published KB only). Writes
 * (rate-limited turns, escalation tickets) are bound to the resolved merchant
 * id + a per-client fingerprint (Origin/UA/IP hash) — never a bare `anon`
 * bucket shared across all visitors. Cross-slug conversation-UUID swaps are
 * rejected (403). Fingerprint throttling is the minimum viable binding until
 * widget tokens land.
 *
 * Probed by `SupportWidget` as `POST /api/public/support/stream` with
 * `Accept: text/event-stream`. Frames are `data:` JSON payloads:
 *   `{"delta": "..."}`   — reasoning-stripped draft text (NOT screened,
 *                           never persisted, never trusted as final)
 *   `{"final": {...}}`    — screened askSupport-shaped payload; the client
 *                           renders it directly with no second call
 *   `{"error": "..."}`    — broke before/without a screened final; the client
 *                           keeps the partial and completes via askSupportFn
 *   `[DONE]`              — terminal marker after the final frame
 *
 * Safety order (mirrors `askSupport`, streaming edition):
 *   validate → merchant → rate-limit (`support.ask`, identical bucket/key) →
 *   inbound screen → takeover suppression → KB retrieval (+ coverage gate) →
 *   preflightStreamGate BEFORE the first byte (empty context → single unsure
 *   final, the LLM is never called) → stream deltas → post-hoc
 *   enforceGroundedReply + screenOutbound on the ASSEMBLED reply →
 *   downgraded/blocked → safe fallback final + escalate via the existing
 *   `createTicket` flow (reused, never reimplemented).
 *
 * Persistence: partial deltas are NEVER written anywhere. The only DB write
 * in this lane is the best-effort escalation ticket on the
 * downgraded/blocked path. Conversation lifecycle, memory, and the
 * intent-driven brain (refund/callback auto-tools, loop breaker, sentiment
 * fast-lane) stay in the non-streaming `askSupport` path, which is also the
 * fallback whenever this stream ends without a screened final.
 */

const MAX_BODY_BYTES = 16_384;

/** Identical bounds to `askSupportFn` in `support.functions.ts`. */
const streamBodySchema = z.object({
  slug: z.string().min(1).max(80),
  message: z.string().trim().min(1).max(1000),
  customerName: z.string().trim().min(1).max(100).optional(),
  customerEmail: z.string().trim().email().max(254).optional(),
  conversationId: z.string().uuid().nullable().optional(),
  orderNumber: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  locale: z.enum(["bn", "en"]).optional(),
  takeoverMode: z.enum(["ai", "human_takeover"]).optional(),
});

type StreamBody = z.infer<typeof streamBodySchema>;

type StreamSource = { label: string; table: string; title?: string };

/** askSupport-shaped payload the widget renders without a second call. */
type StreamFinal = {
  conversationId: string | null;
  reply: string;
  provenance: StreamSource | null;
  sources: StreamSource[];
  confidence: "pinned" | "grounded" | "unsure";
  needsAgent: boolean;
  cta: "none" | "ticket" | "callback" | "human_transfer";
  ticketId?: string | null;
  ticketAction?: {
    ticketId: string;
    subject: string;
    priority: string;
    status: string;
    firstResponseDueAt: string;
    conversationId: string | null;
  } | null;
  retryAfter?: string | null;
  handoffPayload?: unknown;
  degraded?: boolean;
};

const NO_STORE = { "cache-control": "no-store" } as const;

function sseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...(extra ?? {}),
  };
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

const DONE_FRAME = "data: [DONE]\n\n";

function sseStreamResponse(
  body: ReadableStream<Uint8Array>,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(body, { status: 200, headers: sseHeaders(extraHeaders) });
}

/** Single-frame SSE response (pre-work verdicts: rate-limit, etc.). */
function singleFrameResponse(
  frame: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const enc = new TextEncoder();
  const payload = `${sseData(frame)}${DONE_FRAME}`;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(payload));
      controller.close();
    },
  });
  return sseStreamResponse(body, extraHeaders);
}

export const Route = createFileRoute("/api/public/support/stream")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", {
          status: 405,
          headers: { allow: "POST", ...NO_STORE },
        }),

      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
          return Response.json(
            { error: "payload_too_large" },
            { status: 413, headers: NO_STORE },
          );
        }

        let raw: string;
        try {
          raw = await request.text();
        } catch {
          return Response.json(
            { error: "unreadable_body" },
            { status: 400, headers: NO_STORE },
          );
        }
        if (raw.length > MAX_BODY_BYTES) {
          return Response.json(
            { error: "payload_too_large" },
            { status: 413, headers: NO_STORE },
          );
        }

        let body: StreamBody;
        try {
          body = streamBodySchema.parse(JSON.parse(raw || "{}"));
        } catch {
          return Response.json(
            { error: "invalid_payload" },
            { status: 400, headers: NO_STORE },
          );
        }

        const locale = body.locale ?? "en";
        const conversationId = body.conversationId ?? null;

        // Merchant lookup (cached) — mirrors askSupport. No magic platform
        // id: the platform merchant must be a real merchants row (fail closed).
        const { cached } = await import("@/lib/cache.server");
        const { supabaseAdmin } =
          await import("@/integrations/supabase/client.server");
        const querySlug = body.slug === "platform" ? "framique" : body.slug;
        let merchant: { id: string; name: string; slug: string } | null = null;
        try {
          merchant = await cached(
            `support:merchant:${body.slug}`,
            120,
            async () => {
              const { data } = await (
                supabaseAdmin as unknown as {
                  from: (table: string) => {
                    select: (cols: string) => {
                      eq: (
                        col: string,
                        val: string,
                      ) => {
                        maybeSingle: () => Promise<{
                          data: {
                            id: string;
                            name: string;
                            slug: string;
                          } | null;
                        }>;
                      };
                    };
                  };
                }
              )
                .from("merchants")
                .select("id, name, slug")
                .eq("slug", querySlug)
                .maybeSingle();
              if (!data) return null;
              return data;
            },
          );
        } catch {
          merchant = null;
        }
        if (!merchant) {
          return Response.json(
            { error: "store_not_found" },
            { status: 404, headers: NO_STORE },
          );
        }
        const merch = merchant;
        const correlationId =
          request.headers.get("x-request-id") ??
          request.headers.get("x-correlation-id") ??
          null;
        // Per-client fingerprint: Origin + UA + IP hash. Binds anonymous
        // writes so one abusive client cannot exhaust the merchant's shared
        // `anon` bucket, and cross-client bursts are throttled per fingerprint.
        const origin = request.headers.get("origin") ?? "";
        const ua = request.headers.get("user-agent") ?? "";
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
        let fingerprint = "nofp";
        try {
          const { digest } = await import("@/lib/support-guardrails");
          fingerprint = (await digest(`${origin}|${ua}|${ip}`)).slice(0, 32);
        } catch {
          const rawFp = `${origin.slice(0, 32)}:${ip.slice(0, 32)}`;
          fingerprint = rawFp === ":" ? "nofp" : rawFp;
        }
        // Rule 22: cross-slug conversation-UUID swap is rejected before any work.
        if (conversationId) {
          try {
            const { data: owner } = await (
              supabaseAdmin as unknown as {
                from: (t: string) => {
                  select: (c: string) => {
                    eq: (
                      col: string,
                      v: string,
                    ) => {
                      maybeSingle: () => Promise<{
                        data: { merchant_id?: string } | null;
                      }>;
                    };
                  };
                };
              }
            )
              .from("ai_conversations")
              .select("merchant_id")
              .eq("id", conversationId)
              .maybeSingle();
            if (owner?.merchant_id && owner.merchant_id !== merch.id) {
              return Response.json(
                { error: "cross_tenant" },
                { status: 403, headers: NO_STORE },
              );
            }
          } catch {
            // Lookup unavailable → fall through to scoped lane checks.
          }
        }

        // Rate limit IDENTICAL to support.ask: same bucket, same subject key
        // (phone hash → conversation → per-fingerprint anon). A blocked verdict
        // is delivered as a screened final frame so the widget applies its
        // normal cooldown path and keeps the stream probe alive.
        const { rateLimit, rateLimitHeaders } =
          await import("@/lib/rate-limit.server");
        let subject = conversationId ?? `anon:${fingerprint}`;
        try {
          if (body.phone?.trim()) {
            const { hashPhone } = await import("@/lib/ai-support.server");
            subject = await hashPhone(body.phone.trim());
          }
        } catch {
          subject = conversationId ?? `anon:${fingerprint}`;
        }
        const verdict = await rateLimit(
          "support.ask",
          `${merch.id}:${subject}`,
        );
        // Minimum viable write binding: a second per-fingerprint bucket so a
        // single abusive client cannot burn the merchant's shared budget.
        const fpVerdict = await rateLimit(
          "support.ask",
          `${merch.id}:fp:${fingerprint}`,
        );
        const blocked = !verdict.allowed || !fpVerdict.allowed;
        const effectiveVerdict = !verdict.allowed ? verdict : fpVerdict;
        const rlHeaders = {
          ...rateLimitHeaders(effectiveVerdict),
          ...NO_STORE,
        };
        if (blocked) {
          const { en } = await import("@/lib/i18n-dict");
          const limited: StreamFinal = {
            conversationId,
            reply: en("support.rate_limited"),
            provenance: null,
            sources: [],
            confidence: "unsure",
            needsAgent: false,
            cta: "ticket",
            retryAfter: effectiveVerdict.reset_at,
          };
          return singleFrameResponse({ final: limited }, rlHeaders);
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (text: string) => {
              controller.enqueue(enc.encode(text));
            };
            const sendFinal = (final: StreamFinal) => {
              send(sseData({ final }));
              send(DONE_FRAME);
            };
            const sendErrorAndClose = (message: string) => {
              try {
                send(sseData({ error: message }));
              } catch {
                // Client already gone; nothing left to report to.
              }
              try {
                controller.close();
              } catch {
                // Already closed/cancelled.
              }
            };
            try {
              // 1. Inbound screen BEFORE any retrieval or model call.
              const { screenInbound } =
                await import("@/lib/support-guardrails");
              const inbound = screenInbound(body.message);
              if (!inbound.allowed) {
                const { en } = await import("@/lib/i18n-dict");
                sendFinal({
                  conversationId,
                  reply: en("support.guardrail_blocked"),
                  provenance: null,
                  sources: [],
                  confidence: "unsure",
                  needsAgent: true,
                  cta: "ticket",
                });
                controller.close();
                return;
              }

              // 2. Takeover suppression: the bot never streams while a human
              // owns the thread. An error frame (not a final) sends the
              // client to the non-streaming fallback, which owns the
              // suppression reply and bookkeeping.
              if (body.takeoverMode === "human_takeover") {
                sendErrorAndClose("human_takeover_suppressed");
                return;
              }
              if (conversationId) {
                try {
                  const { getConversationTakeoverState } =
                    await import("@/lib/support-agent.server");
                  const state = await getConversationTakeoverState(
                    merch.id,
                    conversationId,
                    { correlationId },
                  );
                  if (state?.takeoverMode === "human_takeover") {
                    sendErrorAndClose("human_takeover_suppressed");
                    return;
                  }
                } catch {
                  // Fail-closed: on lookup failure suppress the stream; the
                  // non-streaming fallback owns the suppression reply.
                  sendErrorAndClose("human_takeover_suppressed");
                  return;
                }
              }

              // 2c. Greeting FIRST — before retrieval, preflight, or degraded
              // handling. Deterministic, never refused, never bannered.
              try {
                const { isGreetingMessage, buildGreetingReply } =
                  await import("@/lib/support-agent.server");
                if (isGreetingMessage(body.message)) {
                  const greeting = buildGreetingReply(merch.name, locale);
                  const { screenOutbound } =
                    await import("@/lib/support-guardrails");
                  const screened = screenOutbound(greeting, { pinned: false });
                  sendFinal({
                    conversationId,
                    reply: screened.allowed
                      ? greeting
                      : "Welcome! How can I help you today?",
                    provenance: null,
                    sources: [],
                    confidence: "grounded",
                    needsAgent: false,
                    cta: "none",
                    degraded: false,
                  });
                  controller.close();
                  return;
                }
              } catch {
                // If the greeting helper is unavailable, fall through to
                // retrieval — never fail a greeting on an import error.
              }

              // 3. Retrieval: same hybrid search + coverage gate as
              // askSupport, so weak single-stem hits cannot pass preflight.
              const { searchKbHybrid, queryCoverage, MIN_QUERY_COVERAGE } =
                await import("@/lib/support-kb.server");
              let hits: Awaited<ReturnType<typeof searchKbHybrid>>;
              try {
                const all = await searchKbHybrid(merch.id, body.message);
                hits = all.filter(
                  (h) =>
                    queryCoverage(body.message, h.title, h.body) >=
                    MIN_QUERY_COVERAGE,
                );
              } catch {
                sendErrorAndClose("retrieval_failed");
                return;
              }
              const context = hits.map((h) => ({
                title: h.title,
                body: h.body,
              }));

              let degraded = false;
              try {
                const { isDegradedEnvironment } =
                  await import("@/lib/support-grounding.server");
                degraded = isDegradedEnvironment();
              } catch {
                degraded = false;
              }

              // 4. Preflight BEFORE the first byte: empty context yields the
              // unsure+handoff fallback verbatim — streamDraft is never
              // reached on this path, so no LLM call happens.
              // Helpful-first cold path (mirrors askSupport, 1bb8c3b) runs
              // BEFORE the preflight refusal: high-stakes warm single-step
              // redirect, then POS/ERP general guidance — never a wall.
              const {
                preflightStreamGate,
                groundedSourcesFromContext,
                enforceGroundedReply,
                buildHandoffPayload,
              } = await import("@/lib/support-grounding.server");
              try {
                const { resolveStreamColdReply } =
                  await import("@/lib/support-agent.server");
                const { getVerifiedContact } =
                  await import("@/lib/support-contact.server");
                let coldContact;
                try {
                  coldContact = getVerifiedContact();
                } catch {
                  coldContact = undefined;
                }
                const cold = resolveStreamColdReply({
                  message: body.message,
                  locale,
                  merchantName: merch.name,
                  contextLength: context.length,
                  ...(coldContact ? { contactInfo: coldContact } : {}),
                });
                if (cold && cold.kind === "high_stakes") {
                  sendFinal({
                    conversationId,
                    reply: cold.reply,
                    provenance: null,
                    sources: [],
                    confidence: "unsure",
                    needsAgent: true,
                    cta: "human_transfer",
                    degraded: false,
                    handoffPayload: buildHandoffPayload({
                      conversationId,
                      transcript: [
                        {
                          role: "customer",
                          body: body.message.slice(0, 2000),
                        },
                        { role: "bot", body: cold.reply.slice(0, 2000) },
                      ],
                      confidence: "unsure",
                      provenance: null,
                      attemptedSources: ["kb"],
                      reason: "stream_high_stakes_redirect",
                    }),
                  });
                  controller.close();
                  return;
                }
                if (cold && cold.kind === "general_guidance") {
                  sendFinal({
                    conversationId,
                    reply: cold.reply,
                    provenance: null,
                    sources: [],
                    confidence: "unsure",
                    needsAgent: false,
                    cta: "none",
                    degraded: false,
                  });
                  controller.close();
                  return;
                }
                // Greeting already answered pre-retrieval (2c); any other
                // null falls through to the preflight refusal below.
              } catch {
                // Resolver unavailable — fall through to preflight refusal.
              }
              const preflight = preflightStreamGate({
                contextLength: context.length,
                locale,
                degraded,
              });
              if (!preflight.ok) {
                sendFinal({
                  conversationId,
                  reply: preflight.fallbackReply,
                  provenance: null,
                  sources: [],
                  confidence: "unsure",
                  needsAgent: true,
                  cta: "human_transfer",
                  degraded,
                  handoffPayload: buildHandoffPayload({
                    conversationId,
                    transcript: [
                      {
                        role: "customer",
                        body: body.message.slice(0, 2000),
                      },
                      {
                        role: "bot",
                        body: preflight.fallbackReply.slice(0, 2000),
                      },
                    ],
                    confidence: "unsure",
                    provenance: null,
                    attemptedSources: ["kb"],
                    reason: "stream_preflight_empty_context",
                  }),
                });
                controller.close();
                return;
              }

              // 5. Stream cleaned deltas. Deltas are reasoning-stripped but
              // NOT outbound-screened: they are never persisted and never
              // trusted as final content.
              const { streamDraft, collectStreamedDraft } =
                await import("@/lib/support-llm.server");
              const deltas: string[] = [];
              try {
                for await (const chunk of streamDraft(
                  { question: body.message, context, locale },
                  { signal: request.signal },
                )) {
                  if (request.signal.aborted) {
                    try {
                      controller.close();
                    } catch {
                      // Client gone; nothing to flush.
                    }
                    return;
                  }
                  if (!chunk) continue;
                  deltas.push(chunk);
                  send(sseData({ delta: chunk }));
                }
              } catch {
                sendErrorAndClose("stream_failed");
                return;
              }
              const assembled = await collectStreamedDraft(deltas);
              if (!assembled.trim()) {
                sendErrorAndClose("empty_stream");
                return;
              }

              // 6. Post-hoc: kernel + outbound screen on the ASSEMBLED
              // reply — per-delta screening cannot catch cross-chunk leaks.
              const sources = groundedSourcesFromContext(context);
              const enforced = enforceGroundedReply({
                reply: assembled,
                confidence: "grounded",
                sources,
                pinned: false,
                deepwiki: false,
                locale,
                degraded,
              });
              const { screenOutbound, redactPii } =
                await import("@/lib/support-guardrails");
              const outbound = screenOutbound(enforced.reply, {
                pinned: false,
              });

              if (enforced.needsAgent || !outbound.allowed) {
                // Downgraded/blocked: safe fallback final + escalate via
                // the existing ticket flow (reused, never reimplemented).
                const { DICT, interpolate } = await import("@/lib/i18n-dict");
                const entry = (
                  DICT as Record<string, { en: string; bn: string }>
                )["support.needs_human"];
                const safeReply = !outbound.allowed
                  ? interpolate(locale === "bn" ? entry.bn : entry.en, {})
                  : enforced.reply;
                try {
                  const {
                    createTicket,
                    needsApprovalReview,
                    approvalAdvisory,
                  } = await import("@/lib/support-tickets.server");
                  let requesterHash: string | null = null;
                  try {
                    if (body.phone?.trim()) {
                      const { hashPhone } =
                        await import("@/lib/ai-support.server");
                      requesterHash = await hashPhone(body.phone.trim());
                    }
                  } catch {
                    requesterHash = null;
                  }
                  const transcript =
                    `customer: ${redactPii(body.message).text}\nbot: ${redactPii(safeReply).text}`.slice(
                      0,
                      3500,
                    );
                  // Subject carries customer text — redact PII like the body.
                  const { buildTicketSubject } =
                    await import("@/lib/support-agent.server");
                  const ticketSubject = buildTicketSubject(body.message);
                  const review = needsApprovalReview({
                    subject: ticketSubject,
                    body: transcript,
                  });
                  const ticket = await createTicket({
                    merchantId: merch.id,
                    subject: ticketSubject,
                    body: transcript,
                    priority: "normal",
                    channel: "widget",
                    conversationId,
                    orderNumber: body.orderNumber ?? null,
                    requesterHash,
                    reason: "support.streaming_downgrade",
                    requiresApproval: review.required,
                  });
                  const ref = `#TKT-${ticket.id.slice(-8).toUpperCase()}`;
                  const replyOut =
                    ticket.status === "pending_approval"
                      ? `${safeReply}\n\n${approvalAdvisory(ref, body.orderNumber ?? null, locale)}`
                      : safeReply;
                  sendFinal({
                    conversationId,
                    reply: replyOut,
                    provenance: null,
                    sources: enforced.sources,
                    confidence: "unsure",
                    needsAgent: true,
                    cta: "ticket",
                    ticketId: ticket.id,
                    ticketAction: {
                      ticketId: ticket.id,
                      subject: ticket.subject,
                      priority: ticket.priority,
                      status: ticket.status,
                      firstResponseDueAt: ticket.first_response_due_at,
                      conversationId,
                    },
                    degraded,
                    handoffPayload: buildHandoffPayload({
                      conversationId,
                      transcript: [
                        {
                          role: "customer",
                          body: redactPii(body.message).text.slice(0, 2000),
                        },
                        {
                          role: "bot",
                          body: redactPii(replyOut).text.slice(0, 2000),
                        },
                      ],
                      confidence: "unsure",
                      provenance: null,
                      attemptedSources: ["kb"],
                      reason: !outbound.allowed
                        ? "stream_outbound_blocked"
                        : "stream_grounding_downgrade",
                    }),
                  });
                } catch {
                  // Ticket write failed: still close with the safe fallback
                  // so the widget never renders the unguarded assembly.
                  sendFinal({
                    conversationId,
                    reply: safeReply,
                    provenance: null,
                    sources: enforced.sources,
                    confidence: "unsure",
                    needsAgent: true,
                    cta: "ticket",
                    degraded,
                  });
                }
                controller.close();
                return;
              }

              // 7. Screened success: the single final the widget renders.
              sendFinal({
                conversationId,
                reply: enforced.reply,
                provenance: sources[0] ?? null,
                sources: enforced.sources,
                confidence: enforced.confidence,
                needsAgent: enforced.needsAgent,
                cta: "none",
                degraded,
              });
              controller.close();
            } catch {
              sendErrorAndClose("stream_failed");
            }
          },
          cancel() {
            // Client disconnected; request.signal aborts the LLM fetch.
          },
        });
        return sseStreamResponse(stream, rlHeaders);
      },
    },
  },
});
