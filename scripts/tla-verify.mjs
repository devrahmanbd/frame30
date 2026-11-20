#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const jarFile = join(process.cwd(), "specs", "tla", "tla2tools.jar");
const PINNED_JAR_SHA256 = "7e53aa636dac8a3cb0533f343115c0548e03fc0ce5edc7739becf58d3d0fb84f";

console.log("[tla-verify] Validating TLA+ specifications and formal invariants...");

// 1. Verified TLC JAR check & SHA-256 verification
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

// 2. Fail-closed Java runtime verification
const javaCandidates = [
  "java",
  "/opt/homebrew/opt/openjdk@21/bin/java",
  "/opt/homebrew/opt/openjdk/bin/java",
  "/usr/lib/jvm/java-21-openjdk-amd64/bin/java"
];

let javaBin = null;
let javaVersion = "";

for (const candidate of javaCandidates) {
  try {
    const javaCheck = execSync(`${candidate} -version 2>&1`, { encoding: "utf-8" });
    if (javaCheck.includes("Runtime") || javaCheck.includes("version") || javaCheck.includes("OpenJDK")) {
      javaBin = candidate;
      javaVersion = javaCheck.trim().split("\n")[0];
      break;
    }
  } catch {
    // Continue checking candidates
  }
}

if (!javaBin) {
  console.error("[tla-verify] ✗ FAIL-CLOSED: Java runtime is required to execute TLC formal model checking!");
  console.error("[tla-verify] Please install OpenJDK 21 (e.g. 'sudo apt-get install openjdk-21-jre-headless' or brew install openjdk@21).");
  process.exit(1);
}

console.log(`[tla-verify] Java runtime detected (${javaBin}): ${javaVersion}`);

const models = [
  {
    name: "CheckoutInventory",
    tlaFile: join(process.cwd(), "specs", "tla", "CheckoutInventory.tla"),
    cfgFile: join(process.cwd(), "specs", "tla", "CheckoutInventory.cfg"),
    proofFile: join(process.cwd(), "docs", "verification-evidence", "tlc-state-space-proof.txt"),
    receiptTitle: "TLA+ TLC FORMAL MODEL CHECKING STATE-SPACE PROOF RECEIPT (CHECKOUT INVENTORY)",
    requiredSymbols: [
      "MODULE CheckoutInventory",
      "TypeOK",
      "Init",
      "Next",
      "Spec",
      "StockNonNegative",
      "InventoryConservation",
      "UniqueOrderIds",
      "MaxActiveOrderPerShopper",
      "AtMostOneCapturePerPayment",
      "AtMostOneSuccessfulRefundPerPayment",
      "OrderSettlementConsistency",
      "RefundRequiresCapture",
      "NoRefundOnFailedPayment",
      "RefundAmountBoundedByCapture",
      "ExplicitRefundFailureRepresented",
      "ProcessPaymentCapture",
      "ProcessRefund",
      "AcquireHold"
    ],
    requiredInvariants: [
      "TypeOK",
      "StockNonNegative",
      "InventoryConservation",
      "UniqueOrderIds",
      "MaxActiveOrderPerShopper",
      "AtMostOneCapturePerPayment",
      "AtMostOneSuccessfulRefundPerPayment",
      "OrderSettlementConsistency",
      "RefundRequiresCapture",
      "NoRefundOnFailedPayment",
      "RefundAmountBoundedByCapture",
      "ExplicitRefundFailureRepresented"
    ]
  },
  {
    name: "ThemeLifecycle",
    tlaFile: join(process.cwd(), "specs", "tla", "ThemeLifecycle.tla"),
    cfgFile: join(process.cwd(), "specs", "tla", "ThemeLifecycle.cfg"),
    proofFile: join(process.cwd(), "docs", "verification-evidence", "tlc-theme-lifecycle-proof.txt"),
    receiptTitle: "TLA+ TLC FORMAL MODEL CHECKING STATE-SPACE PROOF RECEIPT (THEME LIFECYCLE)",
    requiredSymbols: [
      "MODULE ThemeLifecycle",
      "TypeOK",
      "Init",
      "Next",
      "Spec",
      "LoadLegacyDraft",
      "LoadCurrentDraft",
      "RejectFutureDraft",
      "MigrateDraft",
      "EditStructuredMediaValid",
      "EditStructuredMediaInvalid",
      "AutosaveValidDraft",
      "RejectInvalidAutosave",
      "ReloadDraft",
      "PreviewDraft",
      "RejectInvalidPreview",
      "PublishValidDraft",
      "RejectInvalidPublication",
      "MigrationFailure",
      "SaveFailure"
    ],
    requiredInvariants: [
      "TypeOKInv",
      "FutureSchemaNeverDowngraded",
      "FailedMigrationPreservesOriginal",
      "FailedSavePreservesOriginal",
      "InvalidDraftNeverPublished",
      "PublishedVersionIsCanonical",
      "DraftSchemaNeverRegresses",
      "MigrationPreservesStructuredMedia",
      "MigrationIsIdempotent",
      "PreviewUsesValidatedConfiguration",
      "PublishedUsesValidatedConfiguration",
      "PreviewPublishConfigurationConsistency"
    ]
  }
];

for (const model of models) {
  console.log(`\n[tla-verify] --- Verifying model: ${model.name} ---`);
  if (!existsSync(model.tlaFile) || !existsSync(model.cfgFile)) {
    console.error(`[tla-verify] ✗ Missing specification or configuration file for ${model.name}!`);
    process.exit(1);
  }

  const tlaContent = readFileSync(model.tlaFile, "utf-8");
  const cfgContent = readFileSync(model.cfgFile, "utf-8");

  for (const sym of model.requiredSymbols) {
    if (!tlaContent.includes(sym)) {
      console.error(`[tla-verify] ✗ Missing required symbol '${sym}' in ${model.name}.tla!`);
      process.exit(1);
    }
  }

  for (const inv of model.requiredInvariants) {
    if (!cfgContent.includes(inv)) {
      console.error(`[tla-verify] ✗ Invariant '${inv}' not registered in ${model.name}.cfg!`);
      process.exit(1);
    }
  }

  const tlaHash = createHash("sha256").update(tlaContent).digest("hex");
  const cfgHash = createHash("sha256").update(cfgContent).digest("hex");

  console.log(`[tla-verify] Model SHA-256:  ${tlaHash}`);
  console.log(`[tla-verify] Config SHA-256: ${cfgHash}`);
  console.log(`[tla-verify] ✓ Symbols and ${model.requiredInvariants.length} invariants validated for ${model.name}.`);
  console.log(`[tla-verify] Executing TLC model checker for ${model.name}...`);

  try {
    const cmd = `"${javaBin}" -cp "${jarFile}" tlc2.TLC -config "${model.cfgFile}" -nowarning "${model.tlaFile}"`;
    const tlcOutput = execSync(cmd, { encoding: "utf-8", timeout: 60000 });
    console.log(tlcOutput);

    if (!tlcOutput.includes("Model checking completed. No error has been found.")) {
      console.error(`[tla-verify] ✗ TLC Model checking did not complete successfully for ${model.name}!`);
      process.exit(1);
    }

    try {
      const fullProofContent = [
        "=============================================================================",
        model.receiptTitle,
        "=============================================================================",
        `Date: ${new Date().toISOString()}`,
        `Model File: specs/tla/${model.name}.tla`,
        `Model SHA-256:  ${tlaHash}`,
        `Config File: specs/tla/${model.name}.cfg`,
        `Config SHA-256: ${cfgHash}`,
        `TLC JAR SHA-256: ${PINNED_JAR_SHA256}`,
        `Invariants Verified: ${model.requiredInvariants.length} (${model.requiredInvariants.join(", ")})`,
        "-----------------------------------------------------------------------------",
        "",
        tlcOutput.trim(),
        "",
        "============================================================================="
      ].join("\n");
      writeFileSync(model.proofFile, fullProofContent + "\n", "utf-8");
      console.log(`[tla-verify] ✓ Receipt written to ${model.proofFile}`);
    } catch {
      // Optional receipt write
    }
  } catch (err) {
    console.error(`[tla-verify] ✗ TLC Model Checking failed for ${model.name}!`);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

console.log("\n[tla-verify] ✓ All TLA+ state-space model verifications complete with 0 errors.\n");
