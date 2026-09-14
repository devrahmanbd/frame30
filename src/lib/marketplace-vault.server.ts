/**
 * Marketplace vault, payouts and reviews — the write side of §3.3.
 *
 * Every submission is content-addressed: the canonical bundle is hashed and a
 * re-submission of identical bytes returns the existing row instead of
 * creating a second version. Published versions are frozen by a database
 * trigger, so this module never has to trust its own callers for immutability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  canonicalJson,
  compareSemver,
  isBlockKey,
  isBlockTarget,
  isForwardVersion,
  normalizeScopes,
  validateBundle,
} from "./marketplace-scopes";
import { table, type Kind } from "./marketplace.server";
import { incr, log, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ownedListing(db: Client, merchantId: string, kind: Kind, listingId: string) {
  const { data } = await db
    .from(table(kind))
    .select("id, name, slug, version, seller_merchant_id")
    .eq("id", listingId)
    .eq("seller_merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  return data;
}

export type PublishInput = {
  kind: Kind;
  listingId: string;
  version: string;
  changelog: string | null;
  scopes: string[];
  source: Record<string, unknown>;
  blocks: { blockKey: string; name: string; target: string; schema: Record<string, unknown>; entry: string | null }[];
};

/** Submit a new immutable version for review. Idempotent on identical bytes. */
export async function publishVersion(db: Client, merchantId: string, input: PublishInput) {
  return withSpan("market.publish_version", async () => {
    await ownedListing(db, merchantId, input.kind, input.listingId);

    const { scopes, unknown } = normalizeScopes(input.scopes);
    if (unknown.length) throw new Error(`market_unknown_scopes:${unknown.join(",")}`);

    const verdict = validateBundle(input.source, scopes);
    if (!verdict.ok) throw new Error(`market_bundle_invalid:${verdict.errors.join(",")}`);

    for (const b of input.blocks) {
      if (!isBlockKey(b.blockKey)) throw new Error(`market_bad_block_key:${b.blockKey}`);
      if (!isBlockTarget(b.target)) throw new Error(`market_bad_block_target:${b.target}`);
    }

    const { data: existing } = await db
      .from("marketplace_versions")
      .select("id, version, content_hash, status")
      .eq("kind", input.kind)
      .eq("listing_id", input.listingId)
      .order("created_at", { ascending: false });

    const latest = (existing ?? [])
      .map((r) => r.version)
      .sort((a, b) => compareSemver(a, b))
      .pop();

    const canonical = canonicalJson({ source: input.source, scopes });
    const contentHash = await sha256Hex(canonical);

    const replay = (existing ?? []).find((r) => r.content_hash === contentHash);
    if (replay) {
      incr("framique_market_publish_total", { outcome: "replayed" });
      return { ok: true, versionId: replay.id, replayed: true, contentHash, bytes: verdict.bytes };
    }

    if (!isForwardVersion(input.version, latest ?? null)) {
      throw new Error(`market_version_not_forward:${latest ?? "none"}`);
    }

    const { data: row, error } = await db
      .from("marketplace_versions")
      .insert({
        kind: input.kind,
        listing_id: input.listingId,
        seller_merchant_id: merchantId,
        version: input.version,
        content_hash: contentHash,
        source: input.source as never,
        scopes,
        changelog: input.changelog,
        size_bytes: verdict.bytes,
        status: "review",
      })
      .select("id")
      .single();
    if (error || !row) {
      log("warn", "market.publish_failed", { listingId: input.listingId });
      throw new Error("market_publish_failed");
    }

    if (input.blocks.length) {
      const { error: blockErr } = await db.from("marketplace_app_blocks").insert(
        input.blocks.map((b) => ({
          version_id: row.id,
          seller_merchant_id: merchantId,
          kind: input.kind,
          listing_id: input.listingId,
          block_key: b.blockKey,
          name: b.name,
          target: b.target,
          schema: b.schema as never,
          entry: b.entry,
        })),
      );
      if (blockErr) log("warn", "market.blocks_failed", { versionId: row.id });
    }

    incr("framique_market_publish_total", { outcome: "created" });
    return { ok: true, versionId: row.id, replayed: false, contentHash, bytes: verdict.bytes };
  });
}

const VERSION_COLUMNS =
  "id, kind, listing_id, seller_merchant_id, version, content_hash, scopes, changelog, size_bytes, status, review_note, published_at, created_at";

export async function listVersions(db: Client, merchantId: string) {
  const [versions, blocks] = await Promise.all([
    db
      .from("marketplace_versions")
      .select(VERSION_COLUMNS)
      .eq("seller_merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("marketplace_app_blocks")
      .select("id, version_id, block_key, name, target, entry")
      .eq("seller_merchant_id", merchantId),
  ]);
  return { versions: versions.data ?? [], blocks: blocks.data ?? [] };
}

export async function listReviewQueue(db: Client) {
  const { data } = await db
    .from("marketplace_versions")
    .select(VERSION_COLUMNS)
    .in("status", ["review", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

/** Platform moderation of a submitted version. Bytes stay frozen either way. */
export async function reviewVersion(
  db: Client,
  versionId: string,
  status: "active" | "paused" | "archived",
  note: string | null,
) {
  const { error } = await db
    .from("marketplace_versions")
    .update({ status, review_note: note })
    .eq("id", versionId);
  if (error) throw new Error("market_version_review_failed");

  if (status === "active") {
    const { data: v } = await db
      .from("marketplace_versions")
      .select("kind, listing_id, version")
      .eq("id", versionId)
      .maybeSingle();
    if (v) {
      // The listing always advertises its newest approved version.
      await db.from(table(v.kind as Kind)).update({ version: v.version }).eq("id", v.listing_id);
    }
  }
  incr("framique_market_version_review_total", { status });
  return { ok: true, status };
}

/** Versions a merchant may install, plus the blocks each one ships. */
export async function installableVersions(db: Client, kind: Kind, listingId: string) {
  const { data: versions } = await db
    .from("marketplace_versions")
    .select(VERSION_COLUMNS)
    .eq("kind", kind)
    .eq("listing_id", listingId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  const ids = (versions ?? []).map((v) => v.id);
  const { data: blocks } = ids.length
    ? await db
        .from("marketplace_app_blocks")
        .select("id, version_id, block_key, name, target, schema, entry")
        .in("version_id", ids)
    : { data: [] };
  return { versions: versions ?? [], blocks: blocks ?? [] };
}

/** App blocks the merchant is entitled to because they installed the version. */
export async function entitledBlocks(db: Client, merchantId: string) {
  const { data: installs } = await db
    .from("marketplace_installs")
    .select("id, version_id, listing_name, granted_scopes, status")
    .eq("merchant_id", merchantId)
    .in("status", ["installed", "trial"])
    .not("version_id", "is", null);

  const versionIds = (installs ?? []).map((i) => i.version_id).filter(Boolean) as string[];
  if (!versionIds.length) return { installs: installs ?? [], blocks: [] };

  const { data: blocks } = await db
    .from("marketplace_app_blocks")
    .select("id, version_id, block_key, name, target, schema, entry")
    .in("version_id", versionIds);
  return { installs: installs ?? [], blocks: blocks ?? [] };
}

// ------------------------------------------------------------- payouts

export async function payoutOverview(db: Client, merchantId: string) {
  const [payouts, pending] = await Promise.all([
    db
      .from("marketplace_payouts")
      .select("*")
      .eq("seller_merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("wallet_ledger_entries")
      .select("id, seller_minor_int, platform_minor_int, gross_minor_int, currency_code, source, memo, created_at")
      .eq("counterparty_merchant_id", merchantId)
      .is("payout_id", null)
      .gt("seller_minor_int", 0)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rows = pending.data ?? [];
  return {
    payouts: payouts.data ?? [],
    pendingEntries: rows,
    pendingNetMinor: rows.reduce((sum, r) => sum + (r.seller_minor_int ?? 0), 0),
    pendingCurrency: rows[0]?.currency_code ?? "BDT",
  };
}

export async function accruePayout(db: Client, merchantId: string) {
  const { data, error } = await (db as unknown as Rpc).rpc("market_payout_accrue", {
    _seller_merchant_id: merchantId,
  });
  if (error) throw new Error("market_payout_failed");
  incr("framique_market_payout_total", { action: "accrue" });
  return data as { ok: boolean; reason?: string; payout_id?: string; net_minor_int?: number };
}

export async function settlePayout(
  db: Client,
  payoutId: string,
  outcome: "processing" | "paid" | "failed",
  reference: string | null,
  reason: string | null,
) {
  const { data, error } = await (db as unknown as Rpc).rpc("market_payout_settle", {
    _payout_id: payoutId,
    _outcome: outcome,
    _reference: reference,
    _reason: reason,
  });
  if (error) throw new Error("market_payout_settle_failed");
  incr("framique_market_payout_total", { action: outcome });
  return data as { ok: boolean; replayed: boolean; status: string };
}

// ------------------------------------------------------------- reviews

export async function submitReview(db: Client, installId: string, rating: number, comment: string | null) {
  const { data, error } = await (db as unknown as Rpc).rpc("market_review_submit", {
    _install_id: installId,
    _rating: rating,
    _comment: comment,
  });
  if (error) {
    const message = (error as { message?: string }).message ?? "";
    if (message.includes("market.review_requires_install")) throw new Error("market_review_requires_install");
    if (message.includes("market.review_forbidden")) throw new Error("market_review_forbidden");
    throw new Error("market_review_failed");
  }
  incr("framique_market_review_total", { rating: String(rating) });
  return data as { ok: boolean; updated: boolean };
}

export async function listReviews(db: Client, installIds: string[]) {
  if (!installIds.length) return [];
  const { data } = await db
    .from("marketplace_reviews")
    .select("id, install_id, rating, comment, moderation_status, created_at")
    .in("install_id", installIds);
  return data ?? [];
}
