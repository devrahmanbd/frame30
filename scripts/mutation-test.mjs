#!/usr/bin/env node
/**
 * Frame30 Adversarial Mutation Sensitivity Harness
 * Proves that verification gates fail-closed when exposed to deliberate defects.
 * Executes mutations in temporary sandbox, asserts failure detection, restores
 * original source, and confirms clean pass.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const EVIDENCE_DIR = join(REPO_ROOT, "docs/verification-evidence");
const RECEIPT_FILE = join(EVIDENCE_DIR, "mutation-sensitivity-receipt.txt");

console.log("[mutation-test] Commencing Adversarial Mutation Sensitivity Suite...\n");

const receipts = [];

function runMutation(name, setup, runCmd, expectedErrSnippet, cleanup) {
  console.log(`[mutation-test] >>> Running Mutation: ${name}`);
  let detected = false;
  let failureOutput = "";

  try {
    setup();
    try {
      execSync(runCmd, { stdio: "pipe", encoding: "utf8" });
      console.error(`  ✗ FAIL: Gate unexpectedly passed against broken mutation: ${name}`);
    } catch (err) {
      failureOutput = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + err.message;
      if (failureOutput.includes(expectedErrSnippet)) {
        detected = true;
        console.log(`  ✓ SUCCESS: Mutation caught as expected: "${expectedErrSnippet}"`);
      } else {
        console.error(`  ✗ ERROR: Failed with unexpected output:\n${failureOutput}`);
      }
    }
  } finally {
    cleanup();
  }

  // Verify clean restoration
  let restoredOk = false;
  try {
    execSync(runCmd, { stdio: "pipe", encoding: "utf8" });
    restoredOk = true;
    console.log(`  ✓ Restored clean state: gate passes normally.\n`);
  } catch (err) {
    console.error(`  ✗ Restored check failed:\n${err.stdout || err.message}`);
  }

  receipts.push({
    name,
    detected,
    restoredOk,
    expectedErrSnippet,
    sampleSnippet: failureOutput.slice(0, 300).replace(/\n/g, " ")
  });

  if (!detected || !restoredOk) {
    console.error(`[mutation-test] ✗ Mutation test failed for ${name}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Mutation 1: Scope Guard Detection of Forbidden File Modification
// -----------------------------------------------------------------------------
const forbiddenFile = join(REPO_ROOT, "supabase/migrations/unauthorized_test_mutation.sql");
runMutation(
  "Scope Guard: Forbidden File Modification",
  () => {
    writeFileSync(forbiddenFile, "-- unauthorized migration\n", "utf8");
  },
  "node scripts/scope-guard.mjs",
  "Explicitly forbidden by rule: 'supabase/migrations/**'",
  () => {
    if (existsSync(forbiddenFile)) unlinkSync(forbiddenFile);
  }
);

// -----------------------------------------------------------------------------
// Mutation 2: Formal Verification Detection of Broken Reset Inheritance
// -----------------------------------------------------------------------------
const proofFile = join(REPO_ROOT, "specs/bend/PROOF.bend");
const origProof = readFileSync(proofFile, "utf8");
runMutation(
  "Bend 2: Corrupted Reset Override Semantics",
  () => {
    // Break reset_override to return Some 99 instead of None
    const broken = origProof.replace("def reset_override(current_opt):\n  return Option/None", "def reset_override(current_opt):\n  return Option/Some { val: 99 }");
    writeFileSync(proofFile, broken, "utf8");
  },
  "node scripts/bend-verify.mjs",
  "Law 2: Reset Inheritance Restoration: FAILED",
  () => {
    writeFileSync(proofFile, origProof, "utf8");
  }
);

// -----------------------------------------------------------------------------
// Mutation 3: Property Gate Detection of Corrupted Collection Self-Exclusion
// -----------------------------------------------------------------------------
const compFile = join(REPO_ROOT, "src/lib/collection-composition.ts");
const origComp = readFileSync(compFile, "utf8");
runMutation(
  "fast-check: Corrupted Collection Rail Self-Exclusion",
  () => {
    // Invert self-exclusion: always return false, allowing duplicate active rails
    const broken = origComp.replace(
      "return railCollection === active;",
      "return false;"
    );
    writeFileSync(compFile, broken, "utf8");
  },
  "bunx vitest run src/lib/themes/collection-composition-properties.test.ts",
  "AssertionError",
  () => {
    writeFileSync(compFile, origComp, "utf8");
  }
);

// -----------------------------------------------------------------------------
// Mutation 4: Verification Drift Detection of Desynchronized Source File
// -----------------------------------------------------------------------------
runMutation(
  "Verification Drift: Desynchronized Source Hash",
  () => {
    // Append whitespace to covered source file
    writeFileSync(compFile, origComp + "\n// drift comment\n", "utf8");
  },
  "node scripts/verification-drift.mjs",
  "VERIFICATION DRIFT DETECTED",
  () => {
    writeFileSync(compFile, origComp, "utf8");
  }
);

// -----------------------------------------------------------------------------
// Emit Receipt
// -----------------------------------------------------------------------------
mkdirSync(EVIDENCE_DIR, { recursive: true });
const receiptContent = [
  "=============================================================================",
  "FRAME30 ADVERSARIAL MUTATION SENSITIVITY EVIDENCE RECEIPT",
  "=============================================================================",
  `Timestamp: ${new Date().toISOString()}`,
  `Total Mutations Tested: ${receipts.length}`,
  "",
  ...receipts.map((r, i) => [
    `[Mutation ${i + 1}] ${r.name}`,
    `  Detection Status: ${r.detected ? "DETECTED & REJECTED (PASS)" : "UNDETECTED (FAIL)"}`,
    `  Expected Signature: ${r.expectedErrSnippet}`,
    `  Clean Restoration: ${r.restoredOk ? "VERIFIED (PASS)" : "FAILED"}`,
    `  Output Snippet: ${r.sampleSnippet}...`,
    ""
  ].join("\n")),
  "-----------------------------------------------------------------------------",
  "VERDICT: ALL 4 MUTATIONS CONCLUSIVELY DETECTED WITH FAIL-CLOSED GATES.",
  "ZERO LEAKED MUTATIONS. RESTORATION VERIFIED CLEAN.",
  "============================================================================="
].join("\n");

writeFileSync(RECEIPT_FILE, receiptContent, "utf8");
console.log(`[mutation-test] ✓ Receipt written to ${RECEIPT_FILE}`);
console.log("[mutation-test] SUCCESS: All 4 adversarial mutations detected and verified.\n");
process.exit(0);
