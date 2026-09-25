/**
 * Phase 2 R2-2 — plugin sidecar host.
 *
 * Vendor code NEVER runs in this process (see plugin-hooks.server.ts header).
 * The "sidecar" is the supervised lifecycle around outbound delivery: one
 * logical worker per ACTIVE install (enabled AND not suspended AND not
 * kill-switched), with heartbeat, identity `(merchant_id, plugin_id,
 * granted_scopes)`, and stop-on-suspend. Delivery itself reuses the signed,
 * scope-gated `callOne` path; long retries ride `job_queue` (`plugins` queue).
 *
 * v1 is in-process supervised state behind this interface; swapping to an
 * OS-level `child_process` sandbox (resourceLimits, egress allowlist) is a
 * documented follow-up requiring ops sign-off — the interface does not change.
 */
import { listInstalledPlugins } from "./plugins.server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<never>;

export type SidecarWorker = {
  merchantId: string;
  pluginId: string;
  installId: string;
  grantedScopes: string[];
  startedAt: number;
  lastBeatAt: number;
  beats: number;
};

const registry = new Map<string, SidecarWorker>(); // key: `${merchantId}:${pluginId}`

export function listSidecars(merchantId: string): SidecarWorker[] {
  return [...registry.values()].filter((w) => w.merchantId === merchantId);
}

export function stopSidecar(merchantId: string, pluginId: string): boolean {
  return registry.delete(`${merchantId}:${pluginId}`);
}

export async function syncSidecars(
  db: Client,
  merchantId: string,
): Promise<{ started: number; stopped: number; skipped: number }> {
  let started = 0;
  let stopped = 0;
  let skipped = 0;
  // `listInstalledPlugins` already folds the kill switch + suspend flag into
  // `enabled` — no separate `killSwitchOn` query here.
  const installed = await listInstalledPlugins(db as never, merchantId);
  const activeKeys = new Set<string>();
  for (const p of installed) {
    if (!p.enabled) {
      skipped += 1;
      if (stopSidecar(merchantId, p.manifest.id)) stopped += 1;
      continue;
    }
    const key = `${merchantId}:${p.manifest.id}`;
    activeKeys.add(key);
    const existing = registry.get(key);
    if (existing) {
      existing.lastBeatAt = Date.now();
      existing.beats += 1;
      existing.grantedScopes = p.grantedScopes;
      continue;
    }
    registry.set(key, {
      merchantId,
      pluginId: p.manifest.id,
      installId: p.installId,
      grantedScopes: p.grantedScopes,
      startedAt: Date.now(),
      lastBeatAt: Date.now(),
      beats: 1,
    });
    started += 1;
  }
  for (const key of [...registry.keys()]) {
    if (key.startsWith(`${merchantId}:`) && !activeKeys.has(key)) {
      registry.delete(key);
      stopped += 1;
    }
  }
  return { started, stopped, skipped };
}

/** Test seam — process state. */
export function resetSidecars() {
  registry.clear();
}
