import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OfficialArtifact } from "./official-artifacts";

/**
 * Pinned Songoskriti version new merchants receive as default content.
 * Bumped deliberately (never floating): the seed is idempotent per
 * artifact, so a bump appends the next version without moving the live
 * pointer — the publish lane owns the pointer after the first seed.
 */
export const SONGOSKRITI_SEED_VERSION = "1.0.0";

type SeedSongoskritiOutcome =
  | { ok: true; created: boolean }
  | { ok: false; reason: string };

/** Built once per isolate: the ~25 MB source bundle is read off disk once. */
let songoskritiSeedArtifact: {
  version: string;
  artifact: OfficialArtifact;
} | null = null;

/**
 * Songoskriti default content for new merchants (provisioning seed).
 *
 * Builds the pinned official artifact from source and installs it through
 * the NORMAL package pipeline via `seedOfficialArtifacts` (same validators,
 * ledger, version rows as merchant uploads) — so the live path serves the
 * installed artifact, never source statics. Idempotent: re-running replays
 * the pipeline idempotency key and writes nothing.
 *
 * Never throws: provisioning must never fail because default content did.
 * Every failure (missing on-disk inputs in this isolate, build rejection,
 * install error) is logged and reported as `{ ok: false }`.
 */
export async function seedSongoskritiBestEffort(
  db: SupabaseClient<Database>,
  merchantId: string,
): Promise<SeedSongoskritiOutcome> {
  try {
    const [{ buildOfficialArtifact }, { seedOfficialArtifacts }] =
      await Promise.all([
        import("./official-artifacts"),
        import("./official-artifacts-seed.server"),
      ]);
    // On-disk inputs live next to the theme sources; the server bundle may
    // run from a different cwd, so prefer the module-anchored repo root and
    // fall back to the process cwd. First layout carrying both inputs wins.
    const { readFileSync, readdirSync, statSync, existsSync } = await import(
      "node:fs"
    );
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const moduleRoot = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
    );
    const candidates = [moduleRoot, process.cwd()];
    let base: string | null = null;
    for (const root of candidates) {
      if (
        existsSync(join(root, "src", "lib", "themes", "songoskriti", "skins.css")) &&
        existsSync(join(root, "public", "ph", "songoskriti"))
      ) {
        base = root;
        break;
      }
    }
    if (!base) {
      const { log } = await import("./observability.server");
      log("warn", "theme.songoskriti_seed_best_effort_failed", {
        merchantId,
        reason: "inputs_missing",
      });
      return { ok: false, reason: "inputs_missing" };
    }
    if (!songoskritiSeedArtifact || songoskritiSeedArtifact.version !== SONGOSKRITI_SEED_VERSION) {
      const cssText = readFileSync(
        join(base, "src", "lib", "themes", "songoskriti", "skins.css"),
        "utf8",
      );
      const dir = join(base, "public", "ph", "songoskriti");
      const assets = readdirSync(dir)
        .filter((f) => statSync(join(dir, f)).isFile())
        .sort()
        .map((file) => ({
          file,
          bytes: new Uint8Array(readFileSync(join(dir, file))),
        }));
      songoskritiSeedArtifact = {
        version: SONGOSKRITI_SEED_VERSION,
        artifact: buildOfficialArtifact({
          key: "songoskriti",
          version: SONGOSKRITI_SEED_VERSION,
          cssText,
          assets,
        }),
      };
    }
    const [result] = await seedOfficialArtifacts(
      db,
      merchantId,
      [songoskritiSeedArtifact.artifact],
      null,
    );
    return { ok: true, created: result.created };
  } catch (err) {
    try {
      const { log } = await import("./observability.server");
      log("warn", "theme.songoskriti_seed_best_effort_failed", {
        merchantId,
        message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
      });
    } catch {
      // Observability must never break provisioning either.
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    };
  }
}

const planInput = z.object({
  plan: z.enum(["launch", "growth", "business", "enterprise"]),
});

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const billingLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBilling } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await loadBilling(context.supabase, merchantId)) };
  });

/** Read-only proration quote. Never used as the billed amount — the RPC re-derives it. */
export const billingPlanPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    const { planPreview } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return planPreview(context.supabase, merchantId, data.plan);
  });

export const billingChangePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    const { changePlan } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return changePlan(context.supabase, merchantId, context.userId, data.plan);
  });

export const billingClaimTrialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claimTrial, fingerprintOf } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    const claims = context.claims as { email?: string; phone?: string };
    // The signal is hashed server-side; neither the browser nor the DB sees it raw.
    const fingerprint = await fingerprintOf([
      claims.email,
      claims.phone,
      context.userId,
    ]);
    const result = await claimTrial(
      context.supabase,
      merchantId,
      context.userId,
      fingerprint,
    );
    // Onboarding follow-up: seed the public KB corpus once per new merchant.
    // seedPublicKb is idempotent, so re-claims are no-ops. Best-effort — a
    // seed failure must never fail provisioning, so log and continue.
    try {
      const { seedPublicKb } = await import("./support-kb-seed.server");
      await seedPublicKb(context.supabase, merchantId);
    } catch (err) {
      const { log } = await import("./observability.server");
      log("warn", "kb.seed_best_effort_failed", {
        merchantId,
        message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
      });
    }
    // Songoskriti default content: every new merchant gets the pinned
    // official theme through the normal install pipeline (idempotent —
    // re-claims replay without stacking rows). Best-effort with the same
    // contract as the KB seed above: never fails provisioning. The helper
    // itself never throws; the verdict is intentionally uninspected.
    await seedSongoskritiBestEffort(context.supabase, merchantId);
    return result;
  });

export const billingPayInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { payInvoice } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return payInvoice(
      context.supabase,
      merchantId,
      context.userId,
      data.invoiceId,
    );
  });
