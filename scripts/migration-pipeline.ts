#!/usr/bin/env bun
/**
 * Framique 4-Release Expand-and-Contract Migration Pipeline CLI (Phase 11.3).
 *
 * Automated CI PR gatekeeper verifying that schema changes strictly adhere to
 * the 4-stage zero-downtime sequence:
 *
 * 1. Release 1 (Expand): Add new columns/tables. Do not remove or rename old ones.
 * 2. Release 2 (Dual-Write): Application code writes to both old and new schema.
 * 3. Release 3 (Read-New & Backfill): Verify 100% row backfill completion before reads cut over.
 * 4. Release 4 (Contract): Drop old columns/tables only after 100% of servers have run Release 3.
 *
 * Usage:
 *   bun run scripts/migration-pipeline.ts check --stage=1 --file=supabase/migrations/20260909_new_field.sql
 *   bun run scripts/migration-pipeline.ts verify-backfill --job=order_notes_backfill
 *   bun run scripts/migration-pipeline.ts gatekeeper --stage=4 --file=supabase/migrations/contract.sql
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  validatePrMigration,
  validateMigrationFile,
  verifyBackfillJobStatus,
  PIPELINE_STAGES,
  type PipelineReleaseStage,
  type GatekeeperEvaluation,
} from "../src/lib/migration-pipeline.server";

function printEvaluation(res: GatekeeperEvaluation, filePath?: string) {
  const fileDisplay = filePath ? filePath.split("/").pop() : "inline.sql";
  const stageHeader = `\x1b[36m${res.stageName}\x1b[0m`;

  console.log(`\nEvaluation for: \x1b[1m${fileDisplay}\x1b[0m [${stageHeader}]`);

  if (res.allowed) {
    console.log(`  \x1b[32m✓ PASSED\x1b[0m: ${res.summary}`);
  } else {
    console.log(`  \x1b[31m✗ BLOCKED\x1b[0m: ${res.summary}`);
  }

  if (res.backfillVerification) {
    const bv = res.backfillVerification;
    if (bv.verified) {
      console.log(`  \x1b[32m✓ Backfill Verified\x1b[0m: Job '${bv.jobId}' reached 100% (${bv.migratedRows}/${bv.totalRows} rows).`);
    } else {
      console.log(`  \x1b[31m✗ Backfill Unverified\x1b[0m: ${bv.reason}`);
    }
  }

  if (res.violations.length > 0) {
    console.log(`\n  \x1b[31mBlockers (${res.violations.length}):\x1b[0m`);
    for (const v of res.violations) {
      console.log(`    \x1b[31m• [Line ${v.lineNumber}] ${v.ruleId}\x1b[0m: ${v.message}`);
      console.log(`      DDL  : \x1b[90m${v.lineContent}\x1b[0m`);
      console.log(`      Fix  : \x1b[32m${v.remediation}\x1b[0m`);
    }
  }

  if (res.warnings.length > 0) {
    console.log(`\n  \x1b[33mWarnings (${res.warnings.length}):\x1b[0m`);
    for (const w of res.warnings) {
      console.log(`    \x1b[33m• [Line ${w.lineNumber}] ${w.ruleId}\x1b[0m: ${w.message}`);
      console.log(`      Tip  : ${w.remediation}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  console.log("=".repeat(80));
  console.log("Framique 4-Release Expand-and-Contract Migration Pipeline Automation");
  console.log("Enforcing Zero-Downtime PR Gatekeeper Protocol (Phase 11.3)");
  console.log("=".repeat(80));

  // Parse arguments
  let stage: PipelineReleaseStage = 1;
  let filePath: string | undefined;
  let dirPath: string | undefined;
  let backfillJob: string | undefined;
  let verifyBackfillOnly = false;

  for (const arg of args) {
    if (arg.startsWith("--stage=")) {
      stage = parseInt(arg.split("=")[1], 10) as PipelineReleaseStage;
    } else if (arg.startsWith("--file=")) {
      filePath = resolve(process.cwd(), arg.split("=")[1]);
    } else if (arg.startsWith("--dir=")) {
      dirPath = resolve(process.cwd(), arg.split("=")[1]);
    } else if (arg.startsWith("--job=") || arg.startsWith("--backfill-job=")) {
      backfillJob = arg.split("=")[1];
    } else if (arg === "verify-backfill") {
      verifyBackfillOnly = true;
    }
  }

  // Subcommand: verify-backfill
  if (verifyBackfillOnly) {
    if (!backfillJob) {
      console.error("\x1b[31mError: --job=<id> is required for verify-backfill\x1b[0m");
      process.exit(1);
    }
    console.log(`\nVerifying Backfill Job: \x1b[1m${backfillJob}\x1b[0m...`);
    const status = await verifyBackfillJobStatus(backfillJob);
    if (status.verified) {
      console.log(`\x1b[32m✓ 100% Verified\x1b[0m: Job '${backfillJob}' migrated ${status.migratedRows}/${status.totalRows} rows.`);
      process.exit(0);
    } else {
      console.error(`\x1b[31m✗ Incomplete\x1b[0m: ${status.reason}`);
      process.exit(1);
    }
  }

  // Validate specific file
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
      process.exit(1);
    }

    const evalResult = await validateMigrationFile(filePath, stage, backfillJob);
    printEvaluation(evalResult, filePath);

    if (!evalResult.allowed) {
      console.error("\n\x1b[31m[PR BLOCKED] Pull request contains breaking schema changes.\x1b[0m");
      process.exit(1);
    }

    console.log("\n\x1b[32m[PR APPROVED] Schema changes are safe for deployment.\x1b[0m");
    process.exit(0);
  }

  // Validate directory of files
  const targetDir = dirPath || resolve(process.cwd(), "supabase/migrations");
  if (!existsSync(targetDir)) {
    console.error(`\x1b[31mError: Directory not found: ${targetDir}\x1b[0m`);
    process.exit(1);
  }

  const files = readdirSync(targetDir).filter((f) => f.endsWith(".sql")).sort();
  console.log(`\nScanning ${files.length} migrations in ${targetDir} against ${PIPELINE_STAGES[stage].name}...\n`);

  let totalBlockers = 0;
  for (const f of files) {
    const fullPath = resolve(targetDir, f);
    const evalResult = await validateMigrationFile(fullPath, stage, backfillJob);
    if (!evalResult.allowed) {
      totalBlockers += evalResult.violations.length;
      printEvaluation(evalResult, f);
    }
  }

  console.log("\n" + "=".repeat(80));
  if (totalBlockers > 0) {
    console.error(`\x1b[31m[CI PIPELINE FAILED] Found ${totalBlockers} blocker(s) in migration directory.\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[32m[CI PIPELINE PASSED] All scanned migrations conform to ${PIPELINE_STAGES[stage].name}.\x1b[0m`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
