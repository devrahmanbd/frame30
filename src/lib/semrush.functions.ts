/**
 * Phase 5 — RPC server functions for Semrush integrations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const domainSchema = z.string().max(200).optional().default("framique.com");
const databaseSchema = z.enum(["bd", "us", "in", "global"]).optional().default("bd");

export const semrushOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        domain: domainSchema,
        database: databaseSchema,
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { fetchSemrushOverview } = await import("./semrush.server");
    return fetchSemrushOverview(data.domain, data.database);
  });

export const semrushKeywordsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        domain: domainSchema,
        database: databaseSchema,
        limit: z.number().int().min(1).max(100).optional().default(20),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { fetchSemrushKeywords } = await import("./semrush.server");
    return fetchSemrushKeywords(data.domain, data.database, data.limit);
  });

export const semrushCompetitorsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        domain: domainSchema,
        database: databaseSchema,
        limit: z.number().int().min(1).max(20).optional().default(5),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { fetchSemrushCompetitors } = await import("./semrush.server");
    return fetchSemrushCompetitors(data.domain, data.database, data.limit);
  });

export const semrushAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        domain: domainSchema,
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { fetchSemrushCrawlAudit } = await import("./semrush.server");
    return fetchSemrushCrawlAudit(data.domain);
  });
