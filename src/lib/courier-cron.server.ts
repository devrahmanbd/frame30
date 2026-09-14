/**
 * Courier platform sweep. Replays dead-lettered webhooks with backoff, flags
 * stalled parcels and escalates overdue COD remittances. Service-role only.
 */
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";

export type CourierSweepResult = {
  replayed: number;
  dead: number;
  stalled: number;
  cod_overdue: number;
};

export async function runCourierSweep(subject: string): Promise<CourierSweepResult> {
  await rateLimit("courier.sweep", subject);
  return withSpan("courier.sweep", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("courier_sweep");
    if (error) throw error;

    const raw = (data ?? {}) as Partial<Record<keyof CourierSweepResult, number>>;
    const result: CourierSweepResult = {
      replayed: Number(raw.replayed ?? 0),
      dead: Number(raw.dead ?? 0),
      stalled: Number(raw.stalled ?? 0),
      cod_overdue: Number(raw.cod_overdue ?? 0),
    };
    incr("framique_courier_sweep_total", { outcome: result.dead ? "partial" : "ok" });
    log("info", "courier.sweep", { ...result, subject });
    return result;
  });
}
