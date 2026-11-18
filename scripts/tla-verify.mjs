#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const tlaFile = join(process.cwd(), "specs", "tla", "CheckoutInventory.tla");
const cfgFile = join(process.cwd(), "specs", "tla", "CheckoutInventory.cfg");
const jarFile = join(process.cwd(), "specs", "tla", "tla2tools.jar");
const proofFile = join(process.cwd(), "docs", "verification-evidence", "tlc-state-space-proof.txt");

const PINNED_JAR_SHA256 = "7e53aa636dac8a3cb0533f343115c0548e03fc0ce5edc7739becf58d3d0fb84f";

console.log("[tla-verify] Validating TLA+ specification and formal invariants...");

// 1. Structural file check
if (!existsSync(tlaFile) || !existsSync(cfgFile)) {
  console.error("[tla-verify] ✗ Missing specification or configuration file!");
  process.exit(1);
}

// 2. Verified TLC JAR check & SHA-256 verification
if (!existsSync(jarFile)) {
  console.error("[tla-verify] ✗ Pinned TLC tools JAR (tla2tools.jar) is missing!");
  process.exit(1);
}

const jarBuffer = readFileSync(jarFile);
const computedHash = createHash("sha256").update(jarBuffer).digest("hex");
if (computedHash !== PINNED_JAR_SHA256) {
  console.error(`[tla-verify] ✗ TLC JAR SHA-256 checksum mismatch! Expected ${PINNED_JAR_SHA256}, got ${computedHash}`);
  process.exit(1);
}
console.log(`[tla-verify] ✓ TLC JAR integrity verified (SHA-256: ${computedHash.slice(0, 16)}...)`);

const tlaContent = readFileSync(tlaFile, "utf-8");
const cfgContent = readFileSync(cfgFile, "utf-8");

// 3. Verify required operators and invariants
const requiredSymbols = [
  "MODULE CheckoutInventory",
  "TypeOK",
  "Init",
  "Next",
  "Spec",
  "StockNonNegative",
  "InventoryConservation",
  "UniqueOrderIds",
  "MaxActiveOrderPerShopper",
  "AtMostOneSettlementPerPayment",
  "OrderSettlementConsistency",
  "ReceivePaymentWebhook",
  "AcquireHold"
];

for (const sym of requiredSymbols) {
  if (!tlaContent.includes(sym)) {
    console.error(`[tla-verify] ✗ Missing required symbol '${sym}' in TLA+ specification!`);
    process.exit(1);
  }
}

// Check configuration invariants
const requiredInvariants = [
  "TypeOK",
  "StockNonNegative",
  "InventoryConservation",
  "UniqueOrderIds",
  "MaxActiveOrderPerShopper",
  "AtMostOneSettlementPerPayment",
  "OrderSettlementConsistency"
];

for (const inv of requiredInvariants) {
  if (!cfgContent.includes(inv)) {
    console.error(`[tla-verify] ✗ Invariant '${inv}' not registered in CheckoutInventory.cfg!`);
    process.exit(1);
  }
}

console.log("[tla-verify] ✓ TLA+ specification structure and TLC invariants validated.");

// 4. Fail-closed Java runtime verification
let javaVersion = "";
try {
  const javaCheck = execSync("java -version 2>&1", { encoding: "utf-8" });
  if (javaCheck.includes("Runtime") || javaCheck.includes("version") || javaCheck.includes("OpenJDK")) {
    javaVersion = javaCheck.trim().split("\n")[0];
  } else {
    throw new Error("Invalid java output");
  }
} catch {
  console.error("[tla-verify] ✗ FAIL-CLOSED: Java runtime is required to execute TLC formal model checking!");
  console.error("[tla-verify] Please install OpenJDK 21 (e.g. 'sudo apt-get install openjdk-21-jre-headless' or brew install openjdk@21).");
  process.exit(1);
}

console.log(`[tla-verify] Java runtime detected: ${javaVersion}`);
console.log("[tla-verify] Executing TLC model checker...");

try {
  const cmd = `java -cp "${jarFile}" tlc2.TLC -config "${cfgFile}" -nowarning "${tlaFile}"`;
  const tlcOutput = execSync(cmd, { encoding: "utf-8", timeout: 45000 });
  console.log(tlcOutput);

  if (!tlcOutput.includes("Model checking completed. No error has been found.")) {
    console.error("[tla-verify] ✗ TLC Model checking did not complete successfully!");
    process.exit(1);
  }

  // Write verified receipt to proof file
  try {
    writeFileSync(proofFile, tlcOutput, "utf-8");
  } catch {
    // Optional receipt write
  }
} catch (err) {
  console.error("[tla-verify] ✗ TLC Model Checking failed with error!");
  if (err.stdout) console.error(err.stdout);
  if (err.stderr) console.error(err.stderr);
  process.exit(1);
}

console.log("[tla-verify] ✓ TLA+ state-space model verification complete with 0 errors.\n");
