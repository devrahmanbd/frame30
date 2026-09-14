/**
 * Phase 1.5 — global (synced) blocks: the server layer.
 *
 * Design notes that matter in production:
 *
 *  - **Tenancy twice.** Every query is filtered by `merchant_id` *and* runs
 *    through the caller's RLS-scoped client. A bug in one layer cannot leak a
 *    neighbouring store's blocks.
 *  - **Optimistic concurrency.** `updateBlock` requires the revision the editor
 *    loaded; a stale write is rejected with `global_block.conflict` instead of
 *    silently clobbering a colleague's edit. Success bumps `revision`, which is
 *    what makes every placement re-resolve.
 *  - **Sanitise on write, not only on read.** Node arrays go through the same
 *    `parseAst`/`assertPayloadWithinLimits` path as templates, so an unknown
 *    widget type or an over-deep payload can never be stored.
 *  - **Observed.** Every entry point is spanned, counted and logged with the
 *    merchant id, and rate limited per merchant so a runaway editor loop cannot
 *    hammer the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { assertPayloadWithinLimits, parseAst, type Section } from "./builder-ast";
import { assertTenantId } from "./tenant-scope";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { auditAction } from "./hardening.server";
import type { GlobalBlock } from "./global-blocks";

type Client = SupabaseClient<Database>;

const TABLE = "builder_global_blocks";
const MAX_BLOCKS_PER_MERCHANT = 100;
const MAX_NAME = 80;

export class GlobalBlockError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "GlobalBlockError";
  }
}

type Row = {
  id: string;
  name: string;
  nodes: unknown;
  revision: number;
  theme_id: string | null;
  updated_at: string;
};

const SELECT = "id, name, nodes, revision, theme_id, updated_at";

/** Untrusted-in, safe-out: stored JSON is re-parsed on every read. */
function toBlock(row: Row): GlobalBlock {
  return {
    id: row.id,
    name: row.name,
    nodes: sanitiseNodes(row.nodes),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export function sanitiseNodes(input: unknown): Section[] {
  const ast = parseAst({ header: [], main: Array.isArray(input) ? input : [], footer: [] });
  return ast.main.filter((node) => !node.invalid);
}

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new GlobalBlockError("global_block.name_required");
  if (name.length > MAX_NAME) throw new GlobalBlockError("global_block.name_too_long");
  return name;
}

function mapWriteError(error: { code?: string; message?: string }): never {
  // 23505 = unique violation on (merchant, theme, lower(name)).
  if (error.code === "23505") throw new GlobalBlockError("global_block.duplicate_name");
  if (error.code === "42501") throw new GlobalBlockError("global_block.forbidden");
  throw new GlobalBlockError("global_block.write_failed", error.message ?? "write failed");
}

/* --------------------------------------------------------------------- read */

export async function listGlobalBlocks(
  db: Client,
  merchantId: string,
  themeId: string | null = null,
): Promise<GlobalBlock[]> {
  const merchant = assertTenantId(merchantId, "global_blocks.list");
  return withSpan("builder.global_blocks.list", async () => {
    await enforceRateLimit("builder.blocks_read", merchant);
    let query = db.from(TABLE).select(SELECT).eq("merchant_id", merchant);
    if (themeId) query = query.or(`theme_id.is.null,theme_id.eq.${themeId}`);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(MAX_BLOCKS_PER_MERCHANT);
    if (error) throw new GlobalBlockError("global_block.read_failed", error.message);
    const rows = (data ?? []) as Row[];
    incr("builder_global_blocks_read_total", {}, 1);
    return rows.map(toBlock);
  });
}

/* -------------------------------------------------------------------- write */

export type CreateInput = {
  name: string;
  nodes: unknown;
  themeId?: string | null;
};

export async function createGlobalBlock(
  db: Client,
  merchantId: string,
  actor: string | null,
  input: CreateInput,
): Promise<GlobalBlock> {
  const merchant = assertTenantId(merchantId, "global_blocks.create");
  return withSpan("builder.global_blocks.create", async () => {
    await enforceRateLimit("builder.blocks_write", merchant);
    const name = cleanName(input.name);
    assertPayloadWithinLimits(input.nodes);
    const nodes = sanitiseNodes(input.nodes);
    if (!nodes.length) throw new GlobalBlockError("global_block.empty");

    const { count, error: countError } = await db
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchant);
    if (countError) throw new GlobalBlockError("global_block.read_failed", countError.message);
    if ((count ?? 0) >= MAX_BLOCKS_PER_MERCHANT) throw new GlobalBlockError("global_block.limit_reached");

    const { data, error } = await db
      .from(TABLE)
      .insert({
        merchant_id: merchant,
        theme_id: input.themeId ?? null,
        name,
        nodes: nodes as unknown as Json,
        revision: 1,
        created_by: actor,
        updated_by: actor,
      })
      .select(SELECT)
      .single();
    if (error) mapWriteError(error);
    const block = toBlock(data as Row);
    incr("builder_global_blocks_write_total", { op: "create" });
    log("info", "builder.global_block.created", {
      merchant_id: merchant,
      block_id: block.id,
      nodes: nodes.length,
    });
    await auditAction(db, merchant, actor, "builder.global_block.create", "builder_global_block", { name }, block.id);
    return block;
  });
}

export type UpdateInput = {
  id: string;
  /** Revision the editor loaded; a mismatch is a conflict, never a clobber. */
  expectedRevision: number;
  name?: string;
  nodes?: unknown;
};

export async function updateGlobalBlock(
  db: Client,
  merchantId: string,
  actor: string | null,
  input: UpdateInput,
): Promise<GlobalBlock> {
  const merchant = assertTenantId(merchantId, "global_blocks.update");
  return withSpan("builder.global_blocks.update", async () => {
    await enforceRateLimit("builder.blocks_write", merchant);
    const patch: Record<string, unknown> = { updated_by: actor };
    if (typeof input.name === "string") patch["name"] = cleanName(input.name);
    if (typeof input.nodes !== "undefined") {
      assertPayloadWithinLimits(input.nodes);
      const nodes = sanitiseNodes(input.nodes);
      if (!nodes.length) throw new GlobalBlockError("global_block.empty");
      patch["nodes"] = nodes as unknown as Json;
    }
    if (Object.keys(patch).length === 1) throw new GlobalBlockError("global_block.nothing_to_update");
    patch["revision"] = input.expectedRevision + 1;

    const { data, error } = await db
      .from(TABLE)
      .update(patch)
      .eq("id", input.id)
      .eq("merchant_id", merchant)
      .eq("revision", input.expectedRevision)
      .select(SELECT)
      .maybeSingle();
    if (error) mapWriteError(error);
    if (!data) {
      // Either the row moved on (another editor saved) or it is not ours.
      const { data: exists } = await db
        .from(TABLE)
        .select("revision")
        .eq("id", input.id)
        .eq("merchant_id", merchant)
        .maybeSingle();
      incr("builder_global_blocks_conflict_total", {});
      throw new GlobalBlockError(exists ? "global_block.conflict" : "global_block.not_found");
    }
    const block = toBlock(data as Row);
    incr("builder_global_blocks_write_total", { op: "update" });
    log("info", "builder.global_block.updated", {
      merchant_id: merchant,
      block_id: block.id,
      revision: block.revision,
    });
    await auditAction(
      db,
      merchant,
      actor,
      "builder.global_block.update",
      "builder_global_block",
      { revision: block.revision },
      block.id,
    );
    return block;
  });
}

export async function deleteGlobalBlock(
  db: Client,
  merchantId: string,
  actor: string | null,
  id: string,
): Promise<{ id: string }> {
  const merchant = assertTenantId(merchantId, "global_blocks.delete");
  return withSpan("builder.global_blocks.delete", async () => {
    await enforceRateLimit("builder.blocks_write", merchant);
    const { data, error } = await db
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("merchant_id", merchant)
      .select("id")
      .maybeSingle();
    if (error) mapWriteError(error);
    if (!data) throw new GlobalBlockError("global_block.not_found");
    incr("builder_global_blocks_write_total", { op: "delete" });
    log("warn", "builder.global_block.deleted", { merchant_id: merchant, block_id: id });
    await auditAction(db, merchant, actor, "builder.global_block.delete", "builder_global_block", {}, id);
    return { id };
  });
}
