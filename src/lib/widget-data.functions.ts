import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_WIDGET_REQUESTS } from "./widget-data";

const paramValue = z.union([z.string().max(120), z.number(), z.boolean()]);

const requestSchema = z.object({
  key: z.string().min(1).max(300),
  source: z.enum(["collection", "manual", "recommendation", "reviews", "facets", "taxonomy"]),
  params: z.record(z.string().max(40), paramValue),
});

/**
 * The single storefront data call. Every data widget on a page is resolved by
 * one invocation of this function; the client reads rows out of the returned
 * keyed map by node id.
 *
 * Public on purpose (storefronts are anonymous), so it only ever returns
 * published, active catalogue rows for the tenant named by `slug`.
 */
export const resolveWidgetDataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        requests: z.array(requestSchema).max(MAX_WIDGET_REQUESTS),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.requests.length === 0) return {};
    const { publicClient } = await import("./pricing.server");
    const { data: merchant } = await publicClient()
      .from("merchants")
      .select("id")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return {};
    const { resolveWidgetData } = await import("./widget-data.server");
    return resolveWidgetData(merchant.id, { requests: data.requests, byNode: {} });
  });
