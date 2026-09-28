/**
 * T3 — platform charge-key merchant scoping (migration contract pin).
 *
 * Verified defect (2026-09-28): `platform_charge_open` looked up the existing
 * charge by bare `idempotency_key`
 * (`supabase/migrations/20260909195300_phase2_billing_and_giftcards.sql:43`,
 * no merchant filter) while keys are caller-supplied — a colliding key from
 * merchant B returned merchant A's charge row (cross-tenant read inside a
 * SECURITY DEFINER routine that bypasses RLS).
 *
 * These tests pin the fix statically (same pattern as
 * `marketplace-qubickle-contract.test.ts`): the EFFECTIVE lookup — the last
 * `v_existing` select for `platform_charge_open` across sorted migrations,
 * which is what `CREATE OR REPLACE` leaves live — must scope by
 * `(merchant_id, idempotency_key)`, and a unique index must back it.
 *
 * - "isolates colliding keys across merchants" FAILS pre-fix (key-only lookup
 *   returns the other tenant's row in the simulation driven by the effective
 *   predicate) and PASSES post-fix.
 * - "preserves legitimate replay" passes pre- AND post-fix: same
 *   merchant + key must keep returning the existing row.
 * - "backs (merchant_id, idempotency_key) with a unique index" FAILS pre-fix,
 *   PASSES post-fix.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

function sortedMigrations(): string[] {
  return readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
}

function allMigrationsSql(): string {
  return sortedMigrations()
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");
}

/**
 * The live predicate is whatever the LAST `v_existing` lookup for
 * `platform_charge_open` says — later migrations `CREATE OR REPLACE` earlier
 * ones, and files sort lexicographically by timestamp prefix.
 */
function effectiveLookupWhere(): string {
  const sql = allMigrationsSql();
  const matches = [
    ...sql.matchAll(
      /v_existing\s+from\s+public\.platform_charges\s+where\s+([^;]+);/gi,
    ),
  ].map((m) => m[1]!);
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1]!;
}

function lookupIsMerchantScoped(whereClause: string): boolean {
  const w = whereClause.toLowerCase();
  return w.includes("merchant_id") && w.includes("idempotency_key");
}

type ChargeFixture = {
  id: string;
  merchant_id: string;
  idempotency_key: string;
};

/** Mirrors the effective SQL predicate over fixture rows. */
function simulateLookup(
  rows: ChargeFixture[],
  merchantId: string,
  key: string,
): ChargeFixture | undefined {
  const whereClause = effectiveLookupWhere();
  if (lookupIsMerchantScoped(whereClause)) {
    return rows.find(
      (r) => r.merchant_id === merchantId && r.idempotency_key === key,
    );
  }
  return rows.find((r) => r.idempotency_key === key);
}

const MERCHANT_A = "11111111-1111-4111-8111-111111111111";
const MERCHANT_B = "22222222-2222-4222-8222-222222222222";
const SHARED_KEY = "caller-supplied-key-abc123";

const FIXTURE: ChargeFixture[] = [
  { id: "charge-a", merchant_id: MERCHANT_A, idempotency_key: SHARED_KEY },
];

describe("T3 — charge-key merchant scoping", () => {
  it("isolates colliding keys across merchants (lookup scoped by merchant_id)", () => {
    const whereClause = effectiveLookupWhere();
    expect(whereClause).toMatch(/merchant_id/i);
    // Behavioural proof driven by the effective predicate: merchant B opening
    // with merchant A's key must NOT receive merchant A's charge row.
    expect(simulateLookup(FIXTURE, MERCHANT_B, SHARED_KEY)).toBeUndefined();
  });

  it("preserves legitimate replay (same merchant + key returns existing row)", () => {
    // The early-return-existing path must survive the scoping fix.
    expect(allMigrationsSql()).toMatch(/return\s+to_jsonb\(v_existing\)/i);
    expect(simulateLookup(FIXTURE, MERCHANT_A, SHARED_KEY)?.id).toBe(
      "charge-a",
    );
  });

  it("backs (merchant_id, idempotency_key) with a unique index", () => {
    const sql = allMigrationsSql();
    expect(sql).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+\S*platform_charges\S*\s+on\s+public\.platform_charges\s*\(\s*merchant_id\s*,\s*idempotency_key\s*\)/i,
    );
  });
});
