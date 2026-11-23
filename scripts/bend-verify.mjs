#!/usr/bin/env node
/**
 * Frame30 Bend 2 Formal Verifier
 * Validates immutable laws (LAWS.bend) against agent proof implementations (PROOF.bend)
 * using the pinned bend-lang 0.2.38 toolchain.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const REPO_ROOT = process.cwd();
const LAWS_FILE = join(REPO_ROOT, "specs/bend/LAWS.bend");
const PROOF_FILE = join(REPO_ROOT, "specs/bend/PROOF.bend");
const EVIDENCE_DIR = join(REPO_ROOT, "docs/verification-evidence");
const RECEIPT_FILE = join(EVIDENCE_DIR, "bend-proof.txt");

console.log("[bend-verify] Validating Bend 2 formal laws and proof artifacts...");

// 1. Locate Bend Binary
let bendBin = "";
const candidates = [
  process.env.BEND_BIN,
  join(process.env.HOME || "", ".cargo/bin/bend"),
  "/usr/local/bin/bend",
  "/opt/homebrew/bin/bend"
].filter(Boolean);

for (const cand of candidates) {
  if (existsSync(cand)) {
    bendBin = cand;
    break;
  }
}

if (!bendBin) {
  try {
    bendBin = execSync("which bend", { encoding: "utf8" }).trim();
  } catch {
    // not in path
  }
}

if (!bendBin || !existsSync(bendBin)) {
  console.error("[bend-verify] ✗ FAIL-CLOSED: Bend compiler ('bend') not found in PATH or ~/.cargo/bin.");
  process.exit(1);
}

// Ensure PATH includes cargo bin for HVM runtime
const cargoBin = join(process.env.HOME || "", ".cargo/bin");
const env = { ...process.env, PATH: `${cargoBin}:${process.env.PATH}` };

let versionOutput = "";
try {
  versionOutput = execSync(`"${bendBin}" --version`, { env, encoding: "utf8" }).trim();
} catch (err) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: Could not query Bend version: ${err.message}`);
  process.exit(1);
}

console.log(`[bend-verify] Bend toolchain: ${versionOutput} (${bendBin})`);

// 2. Validate Laws and Proof Files
if (!existsSync(LAWS_FILE)) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: Human-owned laws file missing: ${LAWS_FILE}`);
  process.exit(1);
}
if (!existsSync(PROOF_FILE)) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: Proof file missing: ${PROOF_FILE}`);
  process.exit(1);
}

const lawsContent = readFileSync(LAWS_FILE, "utf8");
const proofContent = readFileSync(PROOF_FILE, "utf8");

const lawsSha = createHash("sha256").update(lawsContent).digest("hex");
const proofSha = createHash("sha256").update(proofContent).digest("hex");

console.log(`[bend-verify] LAWS.bend SHA-256:  ${lawsSha}`);
console.log(`[bend-verify] PROOF.bend SHA-256: ${proofSha}`);

// 3. Concatenate and Typecheck / Semantic Check
const combined = `${lawsContent}\n\n${proofContent}\n`;
const scratchFile = join(tmpdir(), `frame30_bend_scratch_${Date.now()}.bend`);
writeFileSync(scratchFile, combined, "utf8");

try {
  console.log("[bend-verify] Running 'bend check' semantic and type validator...");
  execSync(`"${bendBin}" check "${scratchFile}"`, { env, encoding: "utf8" });
  console.log("[bend-verify] ✓ Program is syntactically and semantically correct.");
} catch (err) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: 'bend check' failed:\n${err.stdout || err.stderr || err.message}`);
  process.exit(1);
}

// 4. Execute Proofs with Rust HVM Runtime
console.log("[bend-verify] Executing formal proof verification via 'bend run-rs'...");
let runOutput = "";
try {
  runOutput = execSync(`"${bendBin}" run-rs "${scratchFile}"`, { env, encoding: "utf8" }).trim();
} catch (err) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: 'bend run-rs' execution failed:\n${err.stdout || err.stderr || err.message}`);
  process.exit(1);
}

console.log(`[bend-verify] Execution result: ${runOutput}`);

// Parse Result: [p1, p2, p3, p4, p5]
const match = runOutput.match(/Result:\s*\[([0-9,\s]+)\]/);
if (!match) {
  console.error(`[bend-verify] ✗ FAIL-CLOSED: Unexpected execution output format: ${runOutput}`);
  process.exit(1);
}

const verdicts = match[1].split(",").map(s => parseInt(s.trim(), 10));
const lawNames = [
  "Law 1: Responsive Precedence Cascade",
  "Law 2: Reset Inheritance Restoration",
  "Law 3: Device Isolation",
  "Law 4: Collection Merchandising Self-Exclusion",
  "Law 5: Intentional Cross-Sell Preservation"
];

let allPassed = true;
const proofResults = [];

verdicts.forEach((val, idx) => {
  const name = lawNames[idx] || `Law ${idx + 1}`;
  const passed = val === 1;
  if (!passed) allPassed = false;
  console.log(`  ${passed ? "✓" : "✗"} ${name}: ${passed ? "PROVEN (1)" : "FAILED (0)"}`);
  proofResults.push({ name, passed, val });
});

if (!allPassed) {
  console.error("\n[bend-verify] ✗ FORMAL PROOF FAILED: One or more correctness laws violated.");
  process.exit(1);
}

// 5. Emit Proof Receipt
mkdirSync(EVIDENCE_DIR, { recursive: true });
const receipt = [
  "=============================================================================",
  "BEND 2 FORMAL VERIFICATION & THEOREM PROOF RECEIPT",
  "=============================================================================",
  `Date: ${new Date().toISOString()}`,
  `Compiler: ${versionOutput}`,
  `Toolchain Path: ${bendBin}`,
  `LAWS.bend SHA-256:  ${lawsSha}`,
  `PROOF.bend SHA-256: ${proofSha}`,
  "Laws Verified:",
  ...proofResults.map(p => `  - ${p.name}: ${p.passed ? "PROVEN (PASS)" : "FAILED"}`),
  "-----------------------------------------------------------------------------",
  "Execution Output:",
  runOutput,
  "-----------------------------------------------------------------------------",
  "VERDICT: ALL LAWS FORMALLY VERIFIED AND MACHINE-CHECKED WITH ZERO DISCREPANCIES.",
  "============================================================================="
].join("\n");

writeFileSync(RECEIPT_FILE, receipt, "utf8");
console.log(`[bend-verify] ✓ Receipt written to ${RECEIPT_FILE}`);
try { unlinkSync(scratchFile); } catch {}
process.exit(0);
