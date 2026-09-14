/**
 * Scheduled publish / unpublish runner. Service-role only: the sweep RPC is
 * revoked from anon and authenticated, so this module is the only caller.
 */
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";
import { purgeThemeCache } from "./themes.server";

export type ThemeSweepResult = { published: number; unpublished: number; failed: number };

export async function runThemeSweep(subject: string): Promise<ThemeSweepResult> {
  await rateLimit("builder.sweep", subject);
  return withSpan("builder.sweep", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("theme_sweep");
    if (error) throw error;

    const raw = (data ?? {}) as Partial<ThemeSweepResult>;
    const result: ThemeSweepResult = {
      published: Number(raw.published ?? 0),
      unpublished: Number(raw.unpublished ?? 0),
      failed: Number(raw.failed ?? 0),
    };

    if (result.published || result.unpublished) purgeThemeCache();
    incr("framique_theme_sweep_total", { outcome: result.failed ? "partial" : "ok" });
    log("info", "theme.sweep", { ...result, subject });
    return result;
  });
}
