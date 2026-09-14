/**
 * Dynamic Red/Blue Algorithmic Configuration System (Server-Side).
 *
 * Provides zero-downtime hot-swapping and algorithmic promotion for platform-level
 * configurations (error tracking DSNs, sample rates, platform gateways, webhooks).
 *
 * Key guarantees:
 * 1. Active / Standby (Blue / Red) isolated slots.
 * 2. Automated health probing of candidate slots before promoting to active.
 * 3. Fast L1 in-memory caching with 15-second TTL + instant Redis pub/sub invalidation.
 * 4. Graceful degradation to bootstrap fallback if DB is unreachable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;

export type ConfigSlot = "blue" | "red";

export type DynamicConfigResult<T = unknown> = {
  configId: string;
  activeSlot: ConfigSlot;
  version: number;
  updatedAt: string;
  payload: T;
};

// In-Memory L1 Cache
type CacheEntry = {
  payload: unknown;
  activeSlot: ConfigSlot;
  version: number;
  expiresAt: number;
};

const L1_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000; // 15 seconds

async function adminClient(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}

/**
 * Retrieve active configuration for a given subsystem.
 * Checks L1 cache first; falls back to DB, and then to static fallback.
 */
export async function getDynamicPlatformConfig<T>(
  configId: string,
  fallback?: T,
): Promise<T> {
  const now = Date.now();
  const cached = L1_CACHE.get(configId);
  if (cached && cached.expiresAt > now) {
    return cached.payload as T;
  }

  try {
    const admin = await adminClient();
    const { data, error } = await (admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("platform_get_active_config", { _config_id: configId });

    if (error || !data) {
      // If DB doesn't have the row, try direct table select or fallback
      const { data: row } = await admin
        .from("platform_dynamic_config")
        .select("active_slot, blue_payload, red_payload, version")
        .eq("id", configId)
        .maybeSingle();

      if (row) {
        const slot = (row.active_slot ?? "blue") as ConfigSlot;
        const payload = (slot === "blue" ? row.blue_payload : row.red_payload) as T;
        L1_CACHE.set(configId, {
          payload,
          activeSlot: slot,
          version: row.version ?? 1,
          expiresAt: now + CACHE_TTL_MS,
        });
        return payload;
      }

      if (fallback !== undefined) return fallback;
      return {} as T;
    }

    const res = data as {
      config_id: string;
      active_slot: ConfigSlot;
      version: number;
      payload: T;
    };

    L1_CACHE.set(configId, {
      payload: res.payload,
      activeSlot: res.active_slot,
      version: res.version,
      expiresAt: now + CACHE_TTL_MS,
    });

    return res.payload;
  } catch (err) {
    log("warn", "dynamic_config.load_failed", { configId, error: (err as Error).message });
    if (fallback !== undefined) return fallback;
    return {} as T;
  }
}

/**
 * Retrieve metadata (active slot and version) for a dynamic config.
 */
export async function getDynamicConfigMetadata(
  configId: string,
): Promise<{ activeSlot: ConfigSlot; version: number }> {
  const now = Date.now();
  const cached = L1_CACHE.get(configId);
  if (cached && cached.expiresAt > now) {
    return { activeSlot: cached.activeSlot, version: cached.version };
  }

  try {
    const admin = await adminClient();
    const { data: row } = await admin
      .from("platform_dynamic_config")
      .select("active_slot, version")
      .eq("id", configId)
      .maybeSingle();

    if (row) {
      const activeSlot = (row.active_slot ?? "blue") as ConfigSlot;
      const version = row.version ?? 1;
      return { activeSlot, version };
    }
  } catch {
    // ignore
  }

  return { activeSlot: "blue", version: 1 };
}

/**
 * Stage and algorithmically promote a configuration payload from standby to active slot.
 *
 * Steps:
 * 1. Read current active slot (e.g. 'blue').
 * 2. Stage candidate into standby slot (e.g. 'red').
 * 3. Run validation probe `probeFn(candidate)`.
 * 4. If probe passes, execute atomic promotion of active_slot in DB.
 * 5. Invalidate local L1 cache and broadcast Redis invalidation.
 */
export async function stageAndPromoteConfig<T extends Record<string, unknown>>(
  configId: string,
  candidatePayload: T,
  probeFn?: (candidate: T) => Promise<boolean>,
  reason = "algorithmic_rotation",
): Promise<{ ok: boolean; activeSlot?: ConfigSlot; version?: number; error?: string }> {
  try {
    const admin = await adminClient();

    // 1. Fetch current slot
    const { data: current } = await admin
      .from("platform_dynamic_config")
      .select("active_slot")
      .eq("id", configId)
      .maybeSingle();

    const currentSlot = (current?.active_slot ?? "blue") as ConfigSlot;
    const targetSlot: ConfigSlot = currentSlot === "blue" ? "red" : "blue";

    // 2. Stage candidate into the standby slot
    const { error: stageErr } = await (admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("platform_stage_config_slot", {
      _config_id: configId,
      _target_slot: targetSlot,
      _payload: candidatePayload as unknown as Json,
    });

    if (stageErr) {
      throw new Error(`Failed to stage candidate slot: ${(stageErr as Error).message}`);
    }

    // 3. Algorithmic Health Probe
    if (probeFn) {
      let probePassed = false;
      try {
        probePassed = await probeFn(candidatePayload);
      } catch (err) {
        probePassed = false;
        log("warn", "dynamic_config.probe_exception", {
          configId,
          targetSlot,
          error: (err as Error).message,
        });
      }

      if (!probePassed) {
        incr("framique_dynamic_config_probe_failures_total", { configId, targetSlot });
        return {
          ok: false,
          error: `Health probe failed for candidate slot '${targetSlot}'. Rollback to '${currentSlot}' retained.`,
        };
      }
    }

    // 4. Promote candidate slot
    const { data: promoteRes, error: promoteErr } = await (admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("platform_promote_config_slot", {
      _config_id: configId,
      _target_slot: targetSlot,
      _reason: reason,
    });

    if (promoteErr) {
      throw new Error(`Failed to promote slot: ${(promoteErr as Error).message}`);
    }

    const res = promoteRes as {
      ok: boolean;
      active_slot: ConfigSlot;
      version: number;
    };

    // 5. Invalidate caches immediately
    await invalidateDynamicConfigCache(configId);

    incr("framique_dynamic_config_promoted_total", { configId, newSlot: targetSlot });
    return {
      ok: true,
      activeSlot: res.active_slot,
      version: res.version,
    };
  } catch (err) {
    log("error", "dynamic_config.promotion_error", {
      configId,
      error: (err as Error).message,
    });
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Invalidate cache locally and broadcast to other instances via Redis if available.
 */
export async function invalidateDynamicConfigCache(configId?: string): Promise<void> {
  if (configId) {
    L1_CACHE.delete(configId);
  } else {
    L1_CACHE.clear();
  }

  try {
    const { redisCommand } = await import("./redis.server");
    await redisCommand(["PUBLISH", "config:invalidated", configId ?? "*"]);
  } catch {
    // Redis unavailable; L1 cache TTL handles eventual consistency
  }
}
