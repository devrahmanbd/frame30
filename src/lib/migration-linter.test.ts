import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  lintMigrationDirectory,
  lintMigrationSql,
} from "./migration-linter.server";

describe("Phase 8.1 — Expand-and-Contract Migration Linter & Safety Protocol", () => {
  it("allows safe Expand DDL operations (nullable columns, defaults, new tables)", () => {
    const validExpandSql = `
      -- Safe Stage 1 Expand Migration
      CREATE TABLE IF NOT EXISTS customer_loyalty_tiers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tier_name text NOT NULL,
        discount_bps integer DEFAULT 0 NOT NULL
      );

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_tier text DEFAULT 'bronze' NOT NULL;
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);
    `;

    const result = lintMigrationSql(validExpandSql);
    expect(result.valid).toBe(true);
    expect(result.violations.filter((v) => v.severity === "error").length).toBe(0);
  });

  it("blocks ALTER TABLE DROP COLUMN in standard migrations", () => {
    const dangerousSql = `
      ALTER TABLE orders DROP COLUMN legacy_discount_code;
    `;

    const result = lintMigrationSql(dangerousSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_NO_DROP_COLUMN")).toBe(true);
    expect(result.violations[0].remediation).toContain("Stage 4 Contract");
  });

  it("blocks ALTER TABLE RENAME COLUMN", () => {
    const dangerousSql = `
      ALTER TABLE products RENAME COLUMN title TO product_name;
    `;

    const result = lintMigrationSql(dangerousSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_NO_RENAME_COLUMN")).toBe(true);
    expect(result.violations[0].message).toContain("breaks running Version N (BLUE) pods");
  });

  it("blocks ALTER TABLE RENAME TO (table rename)", () => {
    const dangerousSql = `
      ALTER TABLE customers RENAME TO legacy_customers;
    `;

    const result = lintMigrationSql(dangerousSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_NO_RENAME_TABLE")).toBe(true);
  });

  it("blocks ADD COLUMN NOT NULL without DEFAULT on existing tables", () => {
    const dangerousSql = `
      ALTER TABLE orders ADD COLUMN courier_reference_code text NOT NULL;
    `;

    const result = lintMigrationSql(dangerousSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_NO_NOT_NULL_WITHOUT_DEFAULT")).toBe(true);
  });

  it("blocks in-place column type changes (ALTER COLUMN TYPE)", () => {
    const dangerousSql = `
      ALTER TABLE orders ALTER COLUMN subtotal_cents TYPE bigint;
    `;

    const result = lintMigrationSql(dangerousSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_NO_IN_PLACE_TYPE_ALTERATION")).toBe(true);
    expect(result.violations[0].message).toContain("ACCESS EXCLUSIVE table lock");
  });

  it("permits DROP COLUMN when explicitly annotated as Stage 4 Contract with rationale", () => {
    const validContractSql = `
      -- @framique-stage: contract
      -- @rationale: Legacy column orders.legacy_discount_code has been retired after 30-day dual-write and historical backfill verification.

      ALTER TABLE orders DROP COLUMN legacy_discount_code;
    `;

    const result = lintMigrationSql(validContractSql);
    expect(result.valid).toBe(true);
    expect(result.stage).toBe("contract");
    expect(result.violations.filter((v) => v.severity === "error").length).toBe(0);
  });

  it("rejects contract stage annotations missing an explicit rationale", () => {
    const invalidContractSql = `
      -- @framique-stage: contract
      ALTER TABLE orders DROP COLUMN legacy_discount_code;
    `;

    const result = lintMigrationSql(invalidContractSql);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.ruleId === "RULE_CONTRACT_RATIONALE_REQUIRED")).toBe(true);
  });

  it("ignores commented-out SQL lines without triggering false positives", () => {
    const commentedSql = `
      -- ALTER TABLE orders DROP COLUMN test_column;
      /*
         ALTER TABLE orders RENAME COLUMN foo TO bar;
      */
      ALTER TABLE orders ADD COLUMN notes text;
    `;

    const result = lintMigrationSql(commentedSql);
    expect(result.valid).toBe(true);
    expect(result.violations.filter((v) => v.severity === "error").length).toBe(0);
  });

  it("verifies all existing migrations in supabase/migrations adhere to protocol", () => {
    const migrationsDir = resolve(process.cwd(), "supabase/migrations");
    const summary = lintMigrationDirectory(migrationsDir);

    expect(summary.totalFiles).toBeGreaterThan(0);
    expect(summary.failedFiles).toBe(0);
  });
});
