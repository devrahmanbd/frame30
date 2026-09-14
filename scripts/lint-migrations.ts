#!/usr/bin/env bun
/**
 * Expand-and-Contract Migration Linter CLI (Phase 8.1).
 *
 * Verifies that all database migrations adhere to the zero-downtime
 * Expand-and-Contract protocol, blocking prohibited DDL statements:
 * - DROP COLUMN (unless Stage 4 contract annotated)
 * - RENAME COLUMN
 * - RENAME TABLE
 * - NOT NULL without DEFAULT on existing tables
 * - ALTER COLUMN TYPE (in-place lock-heavy conversions)
 *
 * Usage:
 *   bun run scripts/lint-migrations.ts
 *   bun run scripts/lint-migrations.ts --file supabase/migrations/20260909194000_phase0_security_fixes.sql
 *   bun run scripts/lint-migrations.ts --dir supabase/migrations
 */
import { resolve } from "node:path";
import {
  lintMigrationDirectory,
  lintMigrationFile,
  type LintResult,
} from "../src/lib/migration-linter.server";

function printResult(res: LintResult) {
  const fileName = res.filePath ? res.filePath.split("/").pop() : "inline.sql";
  const stageBadge = res.stage === "contract" ? "\x1b[35m[STAGE 4: CONTRACT]\x1b[0m" : "\x1b[36m[STAGE 1: EXPAND]\x1b[0m";

  if (res.valid && res.violations.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${fileName} ${stageBadge}`);
    return;
  }

  if (res.valid && res.violations.length > 0) {
    console.log(`  \x1b[33m⚠\x1b[0m ${fileName} ${stageBadge} (${res.violations.length} warnings)`);
    for (const v of res.violations) {
      console.log(`    \x1b[33mLine ${v.lineNumber}\x1b[0m [${v.ruleId}]: ${v.message}`);
      console.log(`      Code: \x1b[90m${v.lineContent}\x1b[0m`);
      console.log(`      Tip : ${v.remediation}`);
    }
    return;
  }

  console.log(`  \x1b[31m✗\x1b[0m ${fileName} ${stageBadge} (\x1b[31m${res.violations.length} VIOLATIONS\x1b[0m)`);
  for (const v of res.violations) {
    const color = v.severity === "error" ? "\x1b[31m" : "\x1b[33m";
    console.log(`    ${color}[Line ${v.lineNumber}] ${v.ruleName}\x1b[0m`);
    console.log(`      Offending DDL : \x1b[90m${v.lineContent}\x1b[0m`);
    console.log(`      Violation     : ${v.message}`);
    console.log(`      Remediation   : \x1b[32m${v.remediation}\x1b[0m\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileArgIdx = args.indexOf("--file");
  const dirArgIdx = args.indexOf("--dir");

  console.log("=".repeat(80));
  console.log("Framique Expand-and-Contract Migration Linter (Phase 8.1)");
  console.log("Enforcing Zero-Downtime Database Protocol Across Release Cycles");
  console.log("=".repeat(80));

  if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    const targetFile = resolve(process.cwd(), args[fileArgIdx + 1]);
    console.log(`\nLinting Migration: ${targetFile}\n`);
    const res = lintMigrationFile(targetFile);
    printResult(res);

    console.log("\n" + "=".repeat(80));
    if (!res.valid) {
      console.error("\x1b[31m[LINTER FAILED] Migration violates Expand-and-Contract protocol.\x1b[0m");
      process.exit(1);
    }
    console.log("\x1b[32m[LINTER PASSED] Migration is safe for zero-downtime rolling releases.\x1b[0m");
    return;
  }

  const targetDir =
    dirArgIdx !== -1 && args[dirArgIdx + 1]
      ? resolve(process.cwd(), args[dirArgIdx + 1])
      : resolve(process.cwd(), "supabase/migrations");

  console.log(`\nScanning directory: ${targetDir}\n`);
  const summary = lintMigrationDirectory(targetDir);

  for (const res of summary.results) {
    printResult(res);
  }

  console.log("\n" + "-".repeat(80));
  console.log(`Total Migrations Scanned : ${summary.totalFiles}`);
  console.log(`Compliant Migrations     : \x1b[32m${summary.passedFiles}\x1b[0m`);
  console.log(`Non-Compliant Migrations : ${summary.failedFiles > 0 ? `\x1b[31m${summary.failedFiles}\x1b[0m` : "0"}`);
  console.log("=".repeat(80));

  if (summary.failedFiles > 0) {
    console.error(`\n\x1b[31m[CI CHECK FAILED] ${summary.failedFiles} migration(s) contain prohibited DDL.\x1b[0m`);
    console.error("Prohibited operations: DROP COLUMN, RENAME COLUMN, RENAME TABLE, NOT NULL without DEFAULT.");
    console.error("Refer to Framique Expand-and-Contract guidelines in TODO.md §8.1.");
    process.exit(1);
  }

  console.log("\n\x1b[32m[CI CHECK PASSED] All migrations conform to Expand-and-Contract protocol.\x1b[0m");
}

main().catch((err) => {
  console.error(`Fatal migration linter error: ${(err as Error).message}`);
  process.exit(1);
});
