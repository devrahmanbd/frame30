import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public and unauthenticated on purpose: the docs are a marketing surface and
 * the sandbox is read-only. All abuse control lives in `docs.server.ts` — the
 * wrapper only validates shape and translates thrown errors into a payload the
 * panel can render, because an unhandled throw here would surface as a blank
 * 500 on a documentation page.
 */
export const docsTryItFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        route: z.string().min(3).max(80),
        limit: z.number().int().min(1).max(10).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { runTryIt, TryItError } = await import("./docs.server");
    const { requestOrigin } = await import("./site-origin.server");
    try {
      return { ok: true as const, result: await runTryIt(data, requestOrigin()) };
    } catch (error) {
      if (error instanceof TryItError) {
        return {
          ok: false as const,
          code: error.code,
          message: error.message,
          resetAt: error.resetAt ?? null,
        };
      }
      const { log } = await import("./observability.server");
      log("error", "docs.tryit.unhandled", {
        reason: String((error as Error)?.message ?? error).slice(0, 200),
      });
      return { ok: false as const, code: "unavailable" as const, message: "The sandbox is unavailable right now.", resetAt: null };
    }
  });
