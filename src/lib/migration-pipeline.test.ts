import { describe, it, expect, beforeEach } from "vitest";
import {
  validatePrMigration,
  verifyBackfillJobStatus,
  PIPELINE_STAGES,
} from "./migration-pipeline.server";
import {
  saveBackfillProgress,
  type BackfillProgress,
} from "./migration-backfill.server";

describe("Phase 11.3 — 4-Release Expand-and-Contract Migration Pipeline Automation", () => {
  it("defines the complete 4-stage zero-downtime release sequence", () => {
    expect(PIPELINE_STAGES[1].codeName).toBe("expand");
    expect(PIPELINE_STAGES[2].codeName).toBe("dual_write");
    expect(PIPELINE_STAGES[3].codeName).toBe("read_new");
    expect(PIPELINE_STAGES[4].codeName).toBe("contract");

    expect(PIPELINE_STAGES[1].requiresBackfillVerification).toBe(false);
    expect(PIPELINE_STAGES[3].requiresBackfillVerification).toBe(true);
    expect(PIPELINE_STAGES[4].requiresBackfillVerification).toBe(true);
  });

  describe("Release 1 (Expand) Gatekeeper Validation", () => {
    it("permits safe additive schema changes (nullable columns, defaults, new tables)", async () => {
      const sql = `
        CREATE TABLE public.store_discounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(64) NOT NULL
        );
        ALTER TABLE public.orders ADD COLUMN promo_code VARCHAR(64) DEFAULT '';
        ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC(12,2) NULL;
      `;

      const evalResult = await validatePrMigration({ stage: 1, sqlContent: sql });
      expect(evalResult.allowed).toBe(true);
      expect(evalResult.violations).toHaveLength(0);
      expect(evalResult.summary).toContain("[CI GATEKEEPER PASSED]");
    });

    it("strictly blocks DROP COLUMN in Release 1 (Expand)", async () => {
      const sql = `
        ALTER TABLE public.orders DROP COLUMN legacy_discount;
      `;

      const evalResult = await validatePrMigration({ stage: 1, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_DROP_COLUMN")).toBe(true);
      expect(evalResult.violations[0].message).toContain("[STAGE 1 BLOCKED]");
    });

    it("strictly blocks DROP TABLE in Release 1 (Expand)", async () => {
      const sql = `
        DROP TABLE public.legacy_logs;
      `;

      const evalResult = await validatePrMigration({ stage: 1, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_DROP_TABLE")).toBe(true);
    });

    it("strictly blocks RENAME COLUMN in Release 1 (Expand)", async () => {
      const sql = `
        ALTER TABLE public.orders RENAME COLUMN phone TO mobile_phone;
      `;

      const evalResult = await validatePrMigration({ stage: 1, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_RENAME_COLUMN")).toBe(true);
    });

    it("strictly blocks NOT NULL column addition without DEFAULT in Release 1", async () => {
      const sql = `
        ALTER TABLE public.orders ADD COLUMN tax_identifier VARCHAR(32) NOT NULL;
      `;

      const evalResult = await validatePrMigration({ stage: 1, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_NOT_NULL_WITHOUT_DEFAULT")).toBe(true);
    });
  });

  describe("Release 2 (Dual-Write) Gatekeeper Validation", () => {
    it("strictly blocks DROP COLUMN in Release 2 (Dual-Write)", async () => {
      const sql = `
        ALTER TABLE public.customers DROP COLUMN legacy_phone;
      `;

      const evalResult = await validatePrMigration({ stage: 2, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_DROP_COLUMN")).toBe(true);
      expect(evalResult.violations[0].message).toContain("[STAGE 2 BLOCKED]");
    });

    it("strictly blocks in-place column type alteration in Release 2", async () => {
      const sql = `
        ALTER TABLE public.orders ALTER COLUMN total TYPE bigint;
      `;

      const evalResult = await validatePrMigration({ stage: 2, sqlContent: sql });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_IN_PLACE_TYPE_ALTERATION")).toBe(true);
    });
  });

  describe("Release 3 (Read-New & Backfill Verification) Gatekeeper Validation", () => {
    const testJobId = "order_promo_backfill_job";

    beforeEach(async () => {
      // Seed backfill state in registry
      const progress: BackfillProgress = {
        jobId: testJobId,
        tableName: "orders",
        sourceColumn: "legacy_promo",
        targetColumn: "promo_code",
        status: "completed",
        cursor: "5000",
        rowsProcessed: 5000,
        totalRows: 5000,
        totalBatches: 10,
        rowsPerSecond: 100,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: null,
        dryRun: false,
      };
      await saveBackfillProgress(progress);
    });

    it("approves Release 3 when 100% of historical rows are verified as backfilled", async () => {
      const sql = `
        -- @prerequisite-backfill: order_promo_backfill_job
        -- Cutover reads to promo_code column
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_promo_code ON public.orders(promo_code);
      `;

      const evalResult = await validatePrMigration({
        stage: 3,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(true);
      expect(evalResult.backfillVerification?.verified).toBe(true);
      expect(evalResult.backfillVerification?.percentComplete).toBe(100);
      expect(evalResult.violations).toHaveLength(0);
    });

    it("blocks Release 3 read-cutover if background backfill is still in progress (unmigrated rows)", async () => {
      // Incomplete backfill job: 3,200 / 5,000 rows
      await saveBackfillProgress({
        jobId: "incomplete_promo_job",
        tableName: "orders",
        sourceColumn: "legacy_promo",
        targetColumn: "promo_code",
        status: "running",
        cursor: "3200",
        rowsProcessed: 3200,
        totalRows: 5000,
        totalBatches: 7,
        rowsPerSecond: 80,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        dryRun: false,
      });

      const sql = `
        -- @prerequisite-backfill: incomplete_promo_job
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_promo ON public.orders(promo_code);
      `;

      const evalResult = await validatePrMigration({
        stage: 3,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_BACKFILL_INCOMPLETE")).toBe(true);
      expect(evalResult.violations[0].message).toContain("Background backfill incomplete");
      expect(evalResult.violations[0].message).toContain("running");
    });

    it("blocks dropping columns in Release 3 (drops must wait for Release 4)", async () => {
      const sql = `
        -- @prerequisite-backfill: order_promo_backfill_job
        ALTER TABLE public.orders DROP COLUMN legacy_promo;
      `;

      const evalResult = await validatePrMigration({
        stage: 3,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_NO_DROP_COLUMN")).toBe(true);
      expect(evalResult.violations[0].message).toContain("[STAGE 3 BLOCKED]");
    });
  });

  describe("Release 4 (Contract) Gatekeeper Validation", () => {
    const verifiedJobId = "verified_contract_job";

    beforeEach(async () => {
      await saveBackfillProgress({
        jobId: verifiedJobId,
        tableName: "orders",
        sourceColumn: "old_note",
        targetColumn: "customer_note",
        status: "completed",
        cursor: "1000",
        rowsProcessed: 1000,
        totalRows: 1000,
        totalBatches: 2,
        rowsPerSecond: 100,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: null,
        dryRun: false,
      });
    });

    it("permits DROP COLUMN in Release 4 when annotated, documented, and backfilled", async () => {
      const sql = `
        -- @framique-stage: contract
        -- @rationale: Legacy column old_note retired after 30-day soak on Release 3.
        -- @prerequisite-backfill: verified_contract_job
        ALTER TABLE public.orders DROP COLUMN old_note;
      `;

      const evalResult = await validatePrMigration({
        stage: 4,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(true);
      expect(evalResult.violations).toHaveLength(0);
      expect(evalResult.backfillVerification?.verified).toBe(true);
    });

    it("blocks DROP COLUMN in Release 4 if stage annotation is missing", async () => {
      const sql = `
        -- @rationale: Retired legacy column
        -- @prerequisite-backfill: verified_contract_job
        ALTER TABLE public.orders DROP COLUMN old_note;
      `;

      const evalResult = await validatePrMigration({
        stage: 4,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_CONTRACT_ANNOTATION_REQUIRED")).toBe(true);
    });

    it("blocks DROP COLUMN in Release 4 if rationale documentation is missing", async () => {
      const sql = `
        -- @framique-stage: contract
        -- @prerequisite-backfill: verified_contract_job
        ALTER TABLE public.orders DROP COLUMN old_note;
      `;

      const evalResult = await validatePrMigration({
        stage: 4,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_CONTRACT_RATIONALE_REQUIRED")).toBe(true);
    });

    it("blocks DROP COLUMN in Release 4 if prerequisite backfill is missing or incomplete", async () => {
      const sql = `
        -- @framique-stage: contract
        -- @rationale: Retired legacy column
        ALTER TABLE public.orders DROP COLUMN old_note;
      `;

      const evalResult = await validatePrMigration({
        stage: 4,
        sqlContent: sql,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.violations.some((v) => v.ruleId === "RULE_PREREQUISITE_BACKFILL_REQUIRED")).toBe(true);
    });
  });
});
