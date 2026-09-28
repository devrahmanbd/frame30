/**
 * T2: KB chunks tenant scoping (RED → GREEN).
 *
 * Verified defect (2026-09-28): migration
 * 20260910000000_phase9_support_kb_hybrid_search.sql defines
 *   support_kb_chunks_read FOR SELECT USING (true)
 * plus GRANTs to authenticated and EXECUTE on support_kb_hybrid_search to
 * anon — any login reads all tenants' chunks (including drafts).
 *
 * Fix contract (fail CLOSED, strict tenant isolation on direct reads):
 * - direct chunk SELECT requires merchant membership (viewer+) of the
 *   chunk's own merchant AND a live parent doc with matching merchant_id;
 * - anon has NO direct table access and NO RPC EXECUTE; the storefront AI
 *   path keeps working because it runs server-side via service_role
 *   (src/lib/support-kb.server.ts searchKbHybrid + public support stream),
 *   scoped per-merchant + published-only inside the RPC.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const VULN_MIGRATION = join(
  REPO,
  "supabase/migrations/20260910000000_phase9_support_kb_hybrid_search.sql",
);
const FIX_MIGRATION = join(
  REPO,
  "supabase/migrations/20260928000001_fix_kb_chunks_tenant_rls.sql",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

/** JS mirror of the FIX migration's read-policy semantics (fail closed). */
type Caller = { uid: string | null; memberOf: string[] };
type Chunk = { merchant_id: string; doc_id: string };
type Doc = {
  id: string;
  merchant_id: string;
  status: string;
  deleted_at: string | null;
};

function canReadChunk(chunk: Chunk, doc: Doc | null, caller: Caller): boolean {
  if (caller.uid === null) return false; // anon: no direct reads
  if (!caller.memberOf.includes(chunk.merchant_id)) return false; // strict tenancy
  if (!doc) return false;
  if (doc.id !== chunk.doc_id) return false;
  if (doc.merchant_id !== chunk.merchant_id) return false; // merchant-match guard
  if (doc.deleted_at !== null) return false; // soft-deleted docs stay hidden
  return true;
}

const CHUNK_A = { merchant_id: "m-a", doc_id: "d-a" };
const CHUNK_B = { merchant_id: "m-b", doc_id: "d-b" };
const docFor = (
  m: string,
  status = "published",
  deleted: string | null = null,
): Doc => ({
  id: m === "m-a" ? "d-a" : "d-b",
  merchant_id: m,
  status,
  deleted_at: deleted,
});

describe("T2 RED: vulnerable migration documents the hole", () => {
  it("old migration grants cross-tenant chunk reads (USING (true) + anon RPC)", () => {
    const sql = read(VULN_MIGRATION);
    expect(sql).toMatch(
      /create policy support_kb_chunks_read[\s\S]*?using\s*\(\s*true\s*\)/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.support_kb_hybrid_search[\s\S]*?to authenticated,\s*anon/i,
    );
  });
});

describe("T2 GREEN: fix migration closes the hole", () => {
  it("fix migration exists and replaces the open read policy", () => {
    const sql = read(FIX_MIGRATION);
    expect(sql).toMatch(/drop policy if exists support_kb_chunks_read/i);
    expect(sql).toMatch(/create policy support_kb_chunks_read/i);
  });

  it("fixed read policy has no USING (true); requires membership + live parent doc", () => {
    const sql = read(FIX_MIGRATION);
    const body =
      sql.match(/create policy support_kb_chunks_read[\s\S]*?;/i)?.[0] ?? "";
    expect(body).not.toMatch(/using\s*\(\s*true\s*\)/i);
    // Must use the resolvable (uuid, text, uuid) overload: the sibling call
    // shape has_merchant_role(id, auth.uid(), 'viewer'::enum) references a
    // nonexistent function and fails at CREATE POLICY time (proven on PG16).
    expect(body).toMatch(
      /has_merchant_role\(\s*support_kb_chunks\.merchant_id\s*,\s*'viewer'\s*,\s*auth\.uid\(\)\s*\)/i,
    );
    expect(body).not.toMatch(/auth\.uid\(\)\s*,\s*'viewer'::/i);
    expect(body).toMatch(/support_kb_docs/i);
    expect(body).toMatch(/deleted_at is null/i);
  });

  it("anon loses RPC EXECUTE; authenticated + service_role keep it", () => {
    const sql = read(FIX_MIGRATION);
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.support_kb_hybrid_search[\s\S]*?from\s+[\w,\s]*anon/i,
    );
    // EXECUTE defaults to PUBLIC: revoking from `anon` alone leaves anon
    // executable via PUBLIC (proven live on PG16) — must revoke PUBLIC too.
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.support_kb_hybrid_search[\s\S]*?from\s+[\w,\s]*public/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.support_kb_hybrid_search[\s\S]*?to\s+authenticated/i,
    );
    expect(sql).toMatch(/service_role/i);
  });
});

describe("T2 policy semantics: cross-tenant denied, own-tenant allowed, anon pinned", () => {
  it("cross-tenant draft chunk read is DENIED post-fix", () => {
    const caller: Caller = { uid: "user-b", memberOf: ["m-b"] };
    expect(canReadChunk(CHUNK_A, docFor("m-a", "draft"), caller)).toBe(false);
  });

  it("cross-tenant published chunk read is DENIED post-fix (strict isolation)", () => {
    const caller: Caller = { uid: "user-b", memberOf: ["m-b"] };
    expect(canReadChunk(CHUNK_A, docFor("m-a", "published"), caller)).toBe(
      false,
    );
  });

  it("own-tenant member reads own draft + published chunks", () => {
    const caller: Caller = { uid: "user-a", memberOf: ["m-a"] };
    expect(canReadChunk(CHUNK_A, docFor("m-a", "draft"), caller)).toBe(true);
    expect(canReadChunk(CHUNK_A, docFor("m-a", "published"), caller)).toBe(
      true,
    );
  });

  it("non-member authenticated caller is DENIED even for published chunks", () => {
    const caller: Caller = { uid: "outsider", memberOf: [] };
    expect(canReadChunk(CHUNK_B, docFor("m-b", "published"), caller)).toBe(
      false,
    );
  });

  it("anon (uid null) is DENIED direct chunk reads", () => {
    const caller: Caller = { uid: null, memberOf: [] };
    expect(canReadChunk(CHUNK_B, docFor("m-b", "published"), caller)).toBe(
      false,
    );
  });

  it("member is DENIED chunks of soft-deleted docs and merchant-mismatched docs", () => {
    const caller: Caller = { uid: "user-a", memberOf: ["m-a"] };
    expect(
      canReadChunk(
        CHUNK_A,
        docFor("m-a", "published", "2026-09-28T00:00:00Z"),
        caller,
      ),
    ).toBe(false);
    expect(
      canReadChunk(
        CHUNK_A,
        {
          id: "d-a",
          merchant_id: "m-b",
          status: "published",
          deleted_at: null,
        },
        caller,
      ),
    ).toBe(false);
    expect(canReadChunk(CHUNK_A, null, caller)).toBe(false);
  });
});
