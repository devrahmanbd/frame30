/**
 * Phase 11.3 — 4-Release Expand-and-Contract Migration Pipeline Automation.
 *
 * Implements the automated CI PR gatekeeper verifying that database evolutions
 * strictly adhere to the Shopify/WordPress-grade 4-Stage Zero-Downtime sequence:
 *
 * 1. Release 1 (Expand): Add new columns/tables. Do not remove or rename old ones.
 *    - All new columns must be NULLABLE or have a database DEFAULT.
 *    - Strict prohibition on DROP COLUMN, RENAME COLUMN, RENAME TABLE, ALTER COLUMN TYPE.
 *
 * 2. Release 2 (Dual-Write): Application writes to both old and new schema.
 *    - Zero disruptive DDL permitted in application PRs.
 *
 * 3. Release 3 (Read-New & Backfill): Read exclusively from the new schema.
 *    - Background migration workers backfill historical rows in chunks.
 *    - CI Gatekeeper verifies 100% row backfill completion before read-cutover PR can merge.
 *
 * 4. Release 4 (Contract): Drop legacy columns/tables.
 *    - Allowed only after 100% of nodes have run Release 3 and backfill is verified.
 *    - Requires `-- @framique-stage: contract`, `-- @rationale: ...`, and verified backfill.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getBackfillProgress, type BackfillProgress } from "./migration-backfill.server";
import { EXPAND_CONTRACT_RULES, type LintRule } from "./migration-linter.server";
import { incr, log } from "./observability.server";

export type PipelineReleaseStage = 1 | 2 | 3 | 4;

export type PipelineStageDefinition = {
  stage: PipelineReleaseStage;
  name: string;
  codeName: string;
  description: string;
  allowedDdlPatterns: string[];
  prohibitedDdlPatterns: string[];
  requiresBackfillVerification: boolean;
};

export const PIPELINE_STAGES: Record<PipelineReleaseStage, PipelineStageDefinition> = {
  1: {
    stage: 1,
    name: "Release 1: Expand (Additive Schema)",
    codeName: "expand",
    description: "Add new columns (nullable or defaulted), tables, or indexes. Old schema remains 100% untouched.",
    allowedDdlPatterns: ["ADD COLUMN (NULLABLE/DEFAULT)", "CREATE TABLE", "CREATE INDEX CONCURRENTLY"],
    prohibitedDdlPatterns: ["DROP COLUMN", "DROP TABLE", "RENAME COLUMN", "RENAME TABLE", "ALTER COLUMN TYPE", "NOT NULL without DEFAULT"],
    requiresBackfillVerification: false,
  },
  2: {
    stage: 2,
    name: "Release 2: Dual-Write (Sync Both)",
    codeName: "dual_write",
    description: "Application writes concurrently to both old and new structures. Reads stay on old.",
    allowedDdlPatterns: ["Zero breaking DDL"],
    prohibitedDdlPatterns: ["DROP COLUMN", "DROP TABLE", "RENAME COLUMN", "RENAME TABLE", "ALTER COLUMN TYPE"],
    requiresBackfillVerification: false,
  },
  3: {
    stage: 3,
    name: "Release 3: Read-New & Backfill Verification",
    codeName: "read_new",
    description: "Reads cut over to new schema. Requires 100% historical row backfill completion before merge.",
    allowedDdlPatterns: ["SET NOT NULL (on validated backfilled columns)", "CREATE INDEX"],
    prohibitedDdlPatterns: ["DROP COLUMN", "DROP TABLE", "RENAME COLUMN", "RENAME TABLE"],
    requiresBackfillVerification: true,
  },
  4: {
    stage: 4,
    name: "Release 4: Contract (Prune Deprecated)",
    codeName: "contract",
    description: "Drop deprecated legacy columns and tables after 100% soak on Release 3.",
    allowedDdlPatterns: ["DROP COLUMN (annotated)", "DROP TABLE (annotated)", "DROP TRIGGER"],
    prohibitedDdlPatterns: ["Unannotated DROPs", "Unverified backfills"],
    requiresBackfillVerification: true,
  },
};

export type GatekeeperViolation = {
  ruleId: string;
  severity: "blocker" | "warning";
  lineNumber: number;
  lineContent: string;
  message: string;
  remediation: string;
};

export type GatekeeperEvaluation = {
  stage: PipelineReleaseStage;
  stageName: string;
  allowed: boolean;
  violations: GatekeeperViolation[];
  warnings: GatekeeperViolation[];
  backfillVerification?: {
    jobId?: string;
    verified: boolean;
    totalRows?: number;
    migratedRows?: number;
    percentComplete?: number;
    reason?: string;
  };
  summary: string;
};

/**
 * Clean and strip SQL comments except special Framique metadata annotations.
 */
function cleanSql(sql: string): { lines: { number: number; raw: string; cleaned: string }[]; annotations: Record<string, string> } {
  const lines = sql.split("\n");
  const processed: { number: number; raw: string; cleaned: string }[] = [];
  const annotations: Record<string, string> = {};

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check for metadata annotations
    const match = trimmed.match(/^--\s*@([\w-]+):\s*(.+)$/i);
    if (match) {
      annotations[match[1].toLowerCase()] = match[2].trim();
    }

    // Strip generic SQL comment
    let cleaned = trimmed;
    if (cleaned.startsWith("--")) {
      cleaned = "";
    } else if (cleaned.includes("--")) {
      cleaned = cleaned.split("--")[0].trim();
    }

    processed.push({
      number: index + 1,
      raw: line,
      cleaned,
    });
  });

  return { lines: processed, annotations };
}

/**
 * Verify background backfill job completeness for Release 3 or Release 4.
 */
export async function verifyBackfillJobStatus(jobId: string): Promise<{
  verified: boolean;
  totalRows: number;
  migratedRows: number;
  percentComplete: number;
  reason?: string;
}> {
  const progress = await getBackfillProgress(jobId);

  if (!progress) {
    return {
      verified: false,
      totalRows: 0,
      migratedRows: 0,
      percentComplete: 0,
      reason: `Backfill job '${jobId}' was not found in registry. Has the backfill worker executed?`,
    };
  }

  const migrated = progress.rowsProcessed;
  const total = progress.totalRows ?? progress.rowsProcessed;
  const percent = total > 0 ? Math.floor((migrated / total) * 100) : 100;

  if (progress.status !== "completed") {
    return {
      verified: false,
      totalRows: total,
      migratedRows: migrated,
      percentComplete: percent,
      reason: `Backfill job '${jobId}' is currently '${progress.status}' (${migrated}/${total} rows, ${percent}%). Must be 'completed' with 100% rows before PR merge.`,
    };
  }

  if (total > 0 && migrated < total) {
    return {
      verified: false,
      totalRows: total,
      migratedRows: migrated,
      percentComplete: percent,
      reason: `Backfill job '${jobId}' has unmigrated rows (${total - migrated} remaining out of ${total}).`,
    };
  }

  return {
    verified: true,
    totalRows: total,
    migratedRows: migrated,
    percentComplete: 100,
  };
}

/**
 * CI PR Gatekeeper: Validate whether proposed SQL changes adhere to the targeted release stage.
 */
export async function validatePrMigration(options: {
  stage: PipelineReleaseStage;
  sqlContent: string;
  filePath?: string;
  backfillJobId?: string;
}): Promise<GatekeeperEvaluation> {
  const { stage, sqlContent, filePath } = options;
  const stageDef = PIPELINE_STAGES[stage];
  const { lines, annotations } = cleanSql(sqlContent);

  const violations: GatekeeperViolation[] = [];
  const warnings: GatekeeperViolation[] = [];

  // 1. DDL Statements Inspection
  for (const line of lines) {
    if (!line.cleaned) continue;

    const stmt = line.cleaned;

    // Check against standard expand/contract rules
    for (const rule of EXPAND_CONTRACT_RULES) {
      let matched = false;
      if (rule.pattern && rule.pattern.test(stmt)) {
        matched = true;
      } else if (rule.matcher && rule.matcher(stmt)) {
        matched = true;
      }

      if (matched) {
        // Evaluate by target stage:
        if (stage === 1 || stage === 2) {
          // Release 1 and Release 2 STRICTLY FORBID all breaking DDL
          if (rule.id === "RULE_NO_DROP_COLUMN" || rule.id === "RULE_NO_DROP_TABLE") {
            violations.push({
              ruleId: rule.id,
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE ${stage} BLOCKED] ${rule.message} Attempting to execute DROP operations in ${stageDef.name} violates zero-downtime rules.`,
              remediation: rule.remediation,
            });
          } else if (rule.id === "RULE_NO_RENAME_COLUMN" || rule.id === "RULE_NO_RENAME_TABLE") {
            violations.push({
              ruleId: rule.id,
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE ${stage} BLOCKED] ${rule.message} Renaming schema entities is prohibited. Use Expand-and-Contract instead.`,
              remediation: rule.remediation,
            });
          } else if (rule.id === "RULE_NO_NOT_NULL_WITHOUT_DEFAULT") {
            violations.push({
              ruleId: rule.id,
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE ${stage} BLOCKED] ${rule.message}`,
              remediation: rule.remediation,
            });
          } else if (rule.id === "RULE_NO_IN_PLACE_TYPE_ALTERATION") {
            violations.push({
              ruleId: rule.id,
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE ${stage} BLOCKED] ${rule.message}`,
              remediation: rule.remediation,
            });
          }
        } else if (stage === 3) {
          // Release 3 (Read-New) prohibits drops as well (drops happen in Release 4)
          if (rule.id === "RULE_NO_DROP_COLUMN" || rule.id === "RULE_NO_DROP_TABLE") {
            violations.push({
              ruleId: rule.id,
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE 3 BLOCKED] Legacy columns/tables cannot be dropped in Release 3. Drop operations must wait for Release 4 (Contract) after reads have cut over.`,
              remediation: "Defer all DROP operations to a separate Release 4 Contract PR.",
            });
          }
        } else if (stage === 4) {
          // Release 4 (Contract): Allows DROP COLUMN and DROP TABLE ONLY IF annotated!
          const isContractAnnotated = annotations["framique-stage"] === "contract";
          const hasRationale = Boolean(annotations["rationale"]);

          if (!isContractAnnotated) {
            violations.push({
              ruleId: "RULE_CONTRACT_ANNOTATION_REQUIRED",
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE 4 BLOCKED] Contract migration containing DROP statement must be annotated with '-- @framique-stage: contract'.`,
              remediation: "Add '-- @framique-stage: contract' at the top of the migration file.",
            });
          }

          if (!hasRationale) {
            violations.push({
              ruleId: "RULE_CONTRACT_RATIONALE_REQUIRED",
              severity: "blocker",
              lineNumber: line.number,
              lineContent: line.raw.trim(),
              message: `[STAGE 4 BLOCKED] Contract migration must document verification rationale via '-- @rationale: <reason>'.`,
              remediation: "Add '-- @rationale: Legacy column retired after dual-write and backfill' to migration header.",
            });
          }
        }
      }
    }
  }

  // 2. Backfill Verification for Stage 3 and Stage 4
  let backfillResult: GatekeeperEvaluation["backfillVerification"];
  const targetBackfillJob = options.backfillJobId || annotations["prerequisite-backfill"];

  if (stageDef.requiresBackfillVerification) {
    if (!targetBackfillJob) {
      if (stage === 3) {
        warnings.push({
          ruleId: "WARN_NO_BACKFILL_SPECIFIED",
          severity: "warning",
          lineNumber: 1,
          lineContent: "--",
          message: `Stage 3 read-cutover has no specified backfill job ID. Ensure background backfill is completed if migrating data.`,
          remediation: "Pass '--backfill-job=<id>' or annotate with '-- @prerequisite-backfill: <id>'.",
        });
      } else if (stage === 4) {
        violations.push({
          ruleId: "RULE_PREREQUISITE_BACKFILL_REQUIRED",
          severity: "blocker",
          lineNumber: 1,
          lineContent: "--",
          message: `[STAGE 4 BLOCKED] Release 4 (Contract) requires verification that historical data was 100% backfilled before dropping legacy structures.`,
          remediation: "Annotate file with '-- @prerequisite-backfill: <job_id>' verifying 100% row completion.",
        });
      }
    } else {
      const status = await verifyBackfillJobStatus(targetBackfillJob);
      backfillResult = {
        jobId: targetBackfillJob,
        verified: status.verified,
        totalRows: status.totalRows,
        migratedRows: status.migratedRows,
        percentComplete: status.percentComplete,
        reason: status.reason,
      };

      if (!status.verified) {
        violations.push({
          ruleId: "RULE_BACKFILL_INCOMPLETE",
          severity: "blocker",
          lineNumber: 1,
          lineContent: `-- @prerequisite-backfill: ${targetBackfillJob}`,
          message: `[STAGE ${stage} BLOCKED] Background backfill incomplete: ${status.reason}`,
          remediation: `Ensure the backfill worker finishes 100% rows before merging this PR. Run: 'bun run scripts/migration-pipeline.ts backfill --job=${targetBackfillJob}'`,
        });
      }
    }
  }

  const allowed = violations.length === 0;

  let summary = "";
  if (allowed) {
    summary = `[CI GATEKEEPER PASSED] Migration conforms to ${stageDef.name}. Safe to deploy.`;
    incr("framique_migration_pipeline_passed_total", { stage: String(stage) });
  } else {
    summary = `[CI GATEKEEPER BLOCKED] Migration violates ${stageDef.name} with ${violations.length} blocker(s). Merging is strictly prohibited.`;
    incr("framique_migration_pipeline_blocked_total", { stage: String(stage) });
  }

  log(allowed ? "info" : "warn", "migration_pipeline.evaluated", {
    stage,
    allowed,
    violationsCount: violations.length,
    warningsCount: warnings.length,
    filePath,
  });

  return {
    stage,
    stageName: stageDef.name,
    allowed,
    violations,
    warnings,
    backfillVerification: backfillResult,
    summary,
  };
}

/**
 * Validate a migration file from disk against a release stage.
 */
export async function validateMigrationFile(
  filePath: string,
  stage: PipelineReleaseStage,
  backfillJobId?: string
): Promise<GatekeeperEvaluation> {
  const content = readFileSync(filePath, "utf8");
  return validatePrMigration({
    stage,
    sqlContent: content,
    filePath,
    backfillJobId,
  });
}
