/**
 * Redis Cache Pre-Warming Engine (Phase 6.3).
 *
 * Pre-populates core cache layers before routing customer traffic to a newly
 * deployed or booted container, preventing "thundering herd" database stampedes
 * and latency spikes.
 *
 * Layers pre-warmed:
 * 1. Theme presets & blueprint definitions.
 * 2. Active merchant slugs, metadata, and domain lookups.
 * 3. Standard currency exchange rates (FX).
 * 4. Platform dynamic configuration slots (error tracking, AI gateway, webhooks).
 * 5. Shipping rate card defaults.
 */
import { incr, log, observe } from "./observability.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";

export type WarmupItemResult = {
  layer: string;
  keysWarmed: number;
  durationMs: number;
  status: "ok" | "skipped" | "error";
  error?: string;
};

export type CacheWarmupReport = {
  status: "success" | "partial" | "failed";
  totalKeysWarmed: number;
  totalDurationMs: number;
  layers: WarmupItemResult[];
  timestamp: string;
};

export type WarmupOptions = {
  merchantLimit?: number;
  ttlSeconds?: number;
  dryRun?: boolean;
};

const DEFAULT_WARMUP_TTL = 3600; // 1 hour

/** Helper to write raw cache key directly to Redis L2 with TTL */
async function setWarmKey(key: string, value: unknown, ttlSeconds = DEFAULT_WARMUP_TTL): Promise<boolean> {
  if (!redisConfigured()) return false;
  try {
    const payload = JSON.stringify({ v: value });
    const fullKey = redisKey("cache", key);
    const res = await redisCommand(["SET", fullKey, payload, "PX", ttlSeconds * 1000]);
    return res.ok;
  } catch {
    return false;
  }
}

/** 1. Pre-warm theme presets and blueprints */
export async function warmThemePresets(ttl = DEFAULT_WARMUP_TTL): Promise<WarmupItemResult> {
  const start = Date.now();
  try {
    const { THEME_PRESETS } = await import("./theme-presets");
    const { BLUEPRINT_PRESETS } = await import("./theme-blueprints");

    let count = 0;
    // Cache all presets aggregate
    if (await setWarmKey("theme:presets:all", THEME_PRESETS, ttl)) count++;
    if (await setWarmKey("theme:blueprints:all", BLUEPRINT_PRESETS, ttl)) count++;

    // Cache individual theme presets by key
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
      if (await setWarmKey(`theme:preset:${key}`, preset, ttl)) {
        count++;
      }
    }

    return {
      layer: "Theme Presets & Blueprints",
      keysWarmed: count,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      layer: "Theme Presets & Blueprints",
      keysWarmed: 0,
      durationMs: Date.now() - start,
      status: "error",
      error: (err as Error).message,
    };
  }
}

/** 2. Pre-warm active merchant metadata and domain mappings */
export async function warmMerchantMetadata(
  limit = 50,
  ttl = DEFAULT_WARMUP_TTL,
): Promise<WarmupItemResult> {
  const start = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: merchants, error } = await supabaseAdmin
      .from("merchants")
      .select("id, name, slug, status, plan, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    let count = 0;
    for (const m of merchants ?? []) {
      // Warm slug lookup cache used by support agent and storefront
      if (await setWarmKey(`support:merchant:${m.slug}`, { id: m.id, name: m.name, slug: m.slug }, ttl)) {
        count++;
      }
      if (await setWarmKey(`merchant:slug:${m.slug}`, m, ttl)) {
        count++;
      }
      if (await setWarmKey(`merchant:id:${m.id}`, m, ttl)) {
        count++;
      }
    }

    return {
      layer: "Active Merchant Metadata",
      keysWarmed: count,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      layer: "Active Merchant Metadata",
      keysWarmed: 0,
      durationMs: Date.now() - start,
      status: "error",
      error: (err as Error).message,
    };
  }
}

/** 3. Pre-warm standard FX currency exchange rates */
export async function warmFxRates(ttl = DEFAULT_WARMUP_TTL): Promise<WarmupItemResult> {
  const start = Date.now();
  try {
    // Standard baseline FX conversion table (BDT base)
    const standardRates = {
      base: "BDT",
      rates: {
        BDT: 1.0,
        USD: 0.0083,
        EUR: 0.0078,
        GBP: 0.0066,
        INR: 0.71,
        SAR: 0.031,
        AED: 0.031,
      },
      updatedAt: new Date().toISOString(),
    };

    let count = 0;
    if (await setWarmKey("fx:rates:bdt", standardRates, ttl)) count++;
    if (await setWarmKey("fx:rates:latest", standardRates, ttl)) count++;

    return {
      layer: "Foreign Exchange Rates (FX)",
      keysWarmed: count,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      layer: "Foreign Exchange Rates (FX)",
      keysWarmed: 0,
      durationMs: Date.now() - start,
      status: "error",
      error: (err as Error).message,
    };
  }
}

/** 4. Pre-warm platform dynamic configuration */
export async function warmPlatformDynamicConfig(ttl = DEFAULT_WARMUP_TTL): Promise<WarmupItemResult> {
  const start = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: configs, error } = await supabaseAdmin
      .from("platform_dynamic_config")
      .select("id, active_slot, blue_payload, red_payload, version");

    if (error) throw new Error(error.message);

    let count = 0;
    for (const c of configs ?? []) {
      const activePayload = c.active_slot === "blue" ? c.blue_payload : c.red_payload;
      if (await setWarmKey(`dynamic_config:${c.id}`, activePayload, ttl)) {
        count++;
      }
    }

    return {
      layer: "Platform Dynamic Config",
      keysWarmed: count,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      layer: "Platform Dynamic Config",
      keysWarmed: 0,
      durationMs: Date.now() - start,
      status: "error",
      error: (err as Error).message,
    };
  }
}

/** 5. Pre-warm default shipping rate tables */
export async function warmShippingDefaults(ttl = DEFAULT_WARMUP_TTL): Promise<WarmupItemResult> {
  const start = Date.now();
  try {
    const defaultRateTable = {
      defaultDomesticRate: 6000, // 60 BDT inside Dhaka
      outsideDhakaRate: 12000,   // 120 BDT outside Dhaka
      codFeePercentage: 1.0,
      couriers: ["steadfast", "pathao", "redx", "paperfly"],
    };

    let count = 0;
    if (await setWarmKey("shipping:rates:default", defaultRateTable, ttl)) count++;

    return {
      layer: "Shipping Rate Defaults",
      keysWarmed: count,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      layer: "Shipping Rate Defaults",
      keysWarmed: 0,
      durationMs: Date.now() - start,
      status: "error",
      error: (err as Error).message,
    };
  }
}

/**
 * Execute all cache pre-warming routines concurrently.
 */
export async function warmupAll(opts: WarmupOptions = {}): Promise<CacheWarmupReport> {
  const start = Date.now();
  const ttl = opts.ttlSeconds ?? DEFAULT_WARMUP_TTL;
  const merchantLimit = opts.merchantLimit ?? 50;

  if (opts.dryRun) {
    return {
      status: "success",
      totalKeysWarmed: 0,
      totalDurationMs: 0,
      layers: [
        { layer: "Dry Run Simulation", keysWarmed: 0, durationMs: 0, status: "ok" },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Execute layers
  const layers = await Promise.all([
    warmThemePresets(ttl),
    warmMerchantMetadata(merchantLimit, ttl),
    warmFxRates(ttl),
    warmPlatformDynamicConfig(ttl),
    warmShippingDefaults(ttl),
  ]);

  const totalKeysWarmed = layers.reduce((acc, l) => acc + l.keysWarmed, 0);
  const totalDurationMs = Date.now() - start;
  const hasErrors = layers.some((l) => l.status === "error");
  const allErrors = layers.every((l) => l.status === "error");

  const status: CacheWarmupReport["status"] = allErrors
    ? "failed"
    : hasErrors
      ? "partial"
      : "success";

  incr("framique_cache_warmup_runs_total", { status });
  observe("framique_cache_warmup_duration_ms", totalDurationMs);
  log(hasErrors ? "warn" : "info", "cache.warmup_completed", {
    status,
    totalKeysWarmed,
    totalDurationMs,
  });

  return {
    status,
    totalKeysWarmed,
    totalDurationMs,
    layers,
    timestamp: new Date().toISOString(),
  };
}
