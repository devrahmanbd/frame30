import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Phase 1.4 — bundle/total contract, client entry point.
 *
 * Public on purpose: it quotes published catalogue prices only and returns no
 * customer data. Every consumer (`bundle_offer`, routine/gift builders,
 * refill widgets) posts its item set here rather than doing money math.
 */
export const quoteBundle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        items: z
          .array(
            z.object({
              variantId: z.string().uuid(),
              quantity: z.number().int().min(1).max(99),
            }),
          )
          .max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { quoteBundleTotal } = await import("./bundle-quote.server");
    return quoteBundleTotal(data.slug, data.items);
  });
