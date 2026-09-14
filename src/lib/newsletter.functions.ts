import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { NEWSLETTER_SOURCES } from "./newsletter";

/**
 * Public, unauthenticated RPC surface for the marketing-site newsletter.
 *
 * Thin by contract: validation shape here, every rule in `newsletter.server`.
 * All three are callable by anonymous visitors, so each one is rate limited
 * and audited inside the service layer, and none of them ever returns a
 * payload that reveals whether an address is on the list.
 */
export const subscribeNewsletterFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().min(3).max(254),
        locale: z.enum(["en", "bn"]).default("en"),
        source: z.enum(NEWSLETTER_SOURCES).default("footer"),
        consent: z.boolean(),
        honeypot: z.string().max(200).optional().nullable(),
        renderedAt: z.number().finite().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { subscribeNewsletter, flushOutbox } = await import("./newsletter.server");
    // Opportunistic drain of anything a previous provider blip left behind.
    await flushOutbox().catch(() => ({ processed: 0 }));
    return subscribeNewsletter(data);
  });

export const verifyNewsletterFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(16).max(128) }).parse(data))
  .handler(async ({ data }) => {
    const { verifyNewsletter } = await import("./newsletter.server");
    return verifyNewsletter(data.token);
  });

export const unsubscribeNewsletterFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(16).max(128) }).parse(data))
  .handler(async ({ data }) => {
    const { unsubscribeNewsletter } = await import("./newsletter.server");
    return unsubscribeNewsletter(data.token);
  });