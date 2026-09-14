import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BROWSER_REPORT_MAX_BYTES, BROWSER_REPORT_MECHANISMS } from "@/lib/error-tracking";

/**
 * Phase 12 — browser error collector.
 *
 * Public by necessity (a shopper is never signed in) and treated as hostile
 * input: length checked before the body is read, schema-validated, rate
 * limited per IP, and always answered `202` with an empty body. The DSNs stay
 * server-side, so this endpoint is the only address the page knows.
 */
const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4_000).optional(),
  mechanism: z.enum(BROWSER_REPORT_MECHANISMS),
  route: z.string().max(200).optional(),
  release: z.string().max(80).optional(),
  commit: z.string().max(80).optional(),
});

const NO_STORE = { "cache-control": "no-store" } as const;

function clientIp(request: Request): string {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "";
  return header.split(",")[0]!.trim().slice(0, 64) || "unknown";
}

export const Route = createFileRoute("/api/public/errors")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", { status: 405, headers: { allow: "POST", ...NO_STORE } }),

      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > BROWSER_REPORT_MAX_BYTES) {
          return new Response(null, { status: 413, headers: NO_STORE });
        }

        let raw: string;
        try {
          raw = await request.text();
        } catch {
          return new Response(null, { status: 400, headers: NO_STORE });
        }
        if (raw.length > BROWSER_REPORT_MAX_BYTES) {
          return new Response(null, { status: 413, headers: NO_STORE });
        }

        const parsed = bodySchema.safeParse(((): unknown => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })());
        if (!parsed.success) return new Response(null, { status: 400, headers: NO_STORE });

        const { rateLimit } = await import("@/lib/rate-limit.server");
        const limit = await rateLimit("errors.ingest_ip", clientIp(request));
        if (!limit.allowed) return new Response(null, { status: 429, headers: NO_STORE });

        try {
          const { captureBrowserError } = await import("@/lib/observability.server");
          await captureBrowserError(parsed.data);
        } catch {
          // Error reporting must never fail the page that is already broken.
        }
        return new Response(null, { status: 202, headers: NO_STORE });
      },
    },
  },
});
