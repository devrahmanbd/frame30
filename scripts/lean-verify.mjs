#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { calculateDiscount, calculateOrderTotal } from "../src/lib/commerce/pricing.ts";
import {
  migrateThemeAst,
  validateThemeAst,
  loadAuthoritativeThemeAst,
  THEME_CONTRACT_VERSION
} from "../src/lib/theme-contract.ts";

const leanDir = join(process.cwd(), "specs", "lean");
const pricingLeanFile = join(leanDir, "Framique", "Pricing.lean");
const themeLeanFile = join(leanDir, "Framique", "ThemeLifecycle.lean");
const toolchainFile = join(leanDir, "lean-toolchain");
const lakeFile = join(leanDir, "lakefile.lean");
const mainLeanFile = join(leanDir, "Main.lean");
const themeVectorsFile = join(leanDir, "theme_vectors.json");

console.log("[lean-verify] Validating Lean 4 formal specifications and production correspondence...");

// 1. Toolchain and files existence check (Fail-closed)
const requiredFiles = [pricingLeanFile, themeLeanFile, toolchainFile, lakeFile, mainLeanFile, themeVectorsFile];
for (const f of requiredFiles) {
  if (!existsSync(f)) {
    console.error(`[lean-verify] ✗ Missing required Lean 4 specification file: ${f}`);
    process.exit(1);
  }
}

const toolchain = readFileSync(toolchainFile, "utf-8").trim();
console.log(`[lean-verify] Pinned Lean toolchain: ${toolchain}`);

// Verify Pricing theorems
const pricingContent = readFileSync(pricingLeanFile, "utf-8");
const expectedPricingTheorems = [
  "discount_le_subtotal",
  "final_total_nonneg",
  "fixed_discount_exact",
  "percent_100_exact",
  "bogo_discount_bounded",
  "free_shipping_waives_fee",
  "bogo_zero_cheapest_yields_zero"
];

for (const thm of expectedPricingTheorems) {
  if (!pricingContent.includes(thm)) {
    console.error(`[lean-verify] ✗ Missing formal theorem '${thm}' in Pricing.lean!`);
    process.exit(1);
  }
}
console.log(`[lean-verify] ✓ All ${expectedPricingTheorems.length} formal Pricing theorems declared in Pricing.lean.`);

// Verify ThemeLifecycle theorems
const themeContent = readFileSync(themeLeanFile, "utf-8");
const expectedThemeTheorems = [
  "migration_idempotent",
  "version_monotonic",
  "future_version_preserved",
  "canonical_publication_eligible",
  "media_preserved",
  "invalid_data_rejected",
  "migration_result_safe"
];

for (const thm of expectedThemeTheorems) {
  if (!themeContent.includes(thm)) {
    console.error(`[lean-verify] ✗ Missing formal theorem '${thm}' in ThemeLifecycle.lean!`);
    process.exit(1);
  }
}
console.log(`[lean-verify] ✓ All ${expectedThemeTheorems.length} formal ThemeLifecycle theorems declared in ThemeLifecycle.lean.`);

// 2. Locate Lean & Lake binaries (check PATH and ~/.elan/bin)
const elanPath = join(process.env.HOME || "/root", ".elan", "bin");
const envWithPath = {
  ...process.env,
  PATH: `${elanPath}:${process.env.PATH || ""}`
};

let lakeBin = "lake";
try {
  const lakeVer = execSync(`${lakeBin} --version`, { env: envWithPath, encoding: "utf-8" }).trim();
  console.log(`[lean-verify] Lake compiler detected: ${lakeVer}`);
} catch (err) {
  console.error("[lean-verify] ✗ FAIL-CLOSED: Lean 4 / Lake compiler not found in PATH or ~/.elan/bin!");
  console.error("  Install elan toolchain: curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain " + toolchain);
  process.exit(1);
}

// 3. Compile Lean theorems via lake build (Fail-closed on any compilation error)
console.log("[lean-verify] Compiling Lean theorems with 'lake build'...");
try {
  const buildOut = execSync("lake build", {
    cwd: leanDir,
    env: envWithPath,
    encoding: "utf-8",
    timeout: 60000
  });
  if (buildOut.trim().length > 0) {
    console.log(buildOut.trim());
  }
  console.log("[lean-verify] ✓ Lean 4 theorems and executable machine-checked and compiled successfully.");
} catch (buildErr) {
  console.error("[lean-verify] ✗ FAIL-CLOSED: Lean 4 theorem compilation failed!");
  console.error(buildErr.stdout || buildErr.message);
  process.exit(1);
}

// 4. Execute the compiled Lean vectors program directly (No JS mock fallback!)
console.log("[lean-verify] Executing compiled Lean 4 vector binary to obtain formal outputs...");
let rawLeanOutput = "";
try {
  rawLeanOutput = execSync("lake exe framique_verify", {
    cwd: leanDir,
    env: envWithPath,
    encoding: "utf-8",
    timeout: 30000
  });
} catch (exeErr) {
  const errMsg = (exeErr.stderr || "") + (exeErr.stdout || "") + (exeErr.message || "");
  const isDarwinSegFlag = errMsg.includes("__DATA_CONST segment missing SG_READ_ONLY flag");
  if (process.platform === "darwin" && isDarwinSegFlag) {
    console.log("[lean-verify] Note: Applying documented macOS Darwin dyld segment flag fallback (lean --run)...");
    try {
      const runEnv = { ...envWithPath, LEAN_PATH: ".lake/build/lib" };
      rawLeanOutput = execSync("lean --run Main.lean", {
        cwd: leanDir,
        env: runEnv,
        encoding: "utf-8",
        timeout: 30000
      });
    } catch (fallbackErr) {
      console.error("[lean-verify] ✗ FAIL-CLOSED: Fallback execution of Main.lean failed!");
      console.error(fallbackErr.stdout || fallbackErr.message);
      process.exit(1);
    }
  } else {
    console.error("[lean-verify] ✗ FAIL-CLOSED: Compiled Lean binary execution failed with non-whitelisted error!");
    console.error(errMsg);
    process.exit(1);
  }
}

// 5. Parse compiled Lean outputs
let fullResult;
try {
  const jsonStart = rawLeanOutput.indexOf("{");
  const jsonEnd = rawLeanOutput.lastIndexOf("}") + 1;
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error("No JSON object found in Lean output");
  }
  fullResult = JSON.parse(rawLeanOutput.slice(jsonStart, jsonEnd));
} catch (parseErr) {
  console.error("[lean-verify] ✗ Failed to parse JSON output from compiled Lean vector program!");
  console.error("Output received:", rawLeanOutput);
  process.exit(1);
}

const leanPricingVectors = fullResult.pricing || [];
const leanThemeVectors = fullResult.theme || [];

console.log(`[lean-verify] Received ${leanPricingVectors.length} pricing vectors and ${leanThemeVectors.length} theme vectors from Lean runtime.`);

// --- Verify Pricing Vectors (13 vectors) ---
const EXPECTED_PRICING_VECTOR_IDS = [
  "fixed-less",
  "fixed-exact",
  "fixed-overflow",
  "fixed-zero",
  "percent-10",
  "percent-25",
  "percent-33",
  "percent-100",
  "percent-150-clamp",
  "freeship",
  "bogo-standard",
  "bogo-insufficient-qty",
  "bogo-zero-cheapest"
];

if (leanPricingVectors.length !== 13) {
  console.error(`[lean-verify] ✗ PRICING VECTOR COUNT MISMATCH: Expected 13, got ${leanPricingVectors.length}!`);
  process.exit(1);
}

const pricingVectorConfigurations = {
  "fixed-less": { coupon: { type: "fixed", amount_minor_int: 2500 }, lines: [] },
  "fixed-exact": { coupon: { type: "fixed", amount_minor_int: 5000 }, lines: [] },
  "fixed-overflow": { coupon: { type: "fixed", amount_minor_int: 7500 }, lines: [] },
  "fixed-zero": { coupon: { type: "fixed", amount_minor_int: 1000 }, lines: [] },
  "percent-10": { coupon: { type: "percent", percent_off: 10 }, lines: [] },
  "percent-25": { coupon: { type: "percent", percent_off: 25 }, lines: [] },
  "percent-33": { coupon: { type: "percent", percent_off: 33 }, lines: [] },
  "percent-100": { coupon: { type: "percent", percent_off: 100 }, lines: [] },
  "percent-150-clamp": { coupon: { type: "percent", percent_off: 150 }, lines: [] },
  "freeship": { coupon: { type: "free_shipping" }, lines: [] },
  "bogo-standard": {
    coupon: { type: "bogo", buy_quantity: 1, get_quantity: 1 },
    lines: [
      { unitPriceMinor: 4500, quantity: 2 },
      { unitPriceMinor: 5500, quantity: 2 }
    ]
  },
  "bogo-insufficient-qty": {
    coupon: { type: "bogo", buy_quantity: 2, get_quantity: 1 },
    lines: [{ unitPriceMinor: 5000, quantity: 2 }]
  },
  "bogo-zero-cheapest": {
    coupon: { type: "bogo", buy_quantity: 1, get_quantity: 1 },
    lines: [{ unitPriceMinor: 0, quantity: 4 }]
  }
};

let matchedPricingCount = 0;
for (const lVec of leanPricingVectors) {
  const config = pricingVectorConfigurations[lVec.id];
  if (!config) {
    console.error(`[lean-verify] ✗ Unknown pricing vector ID: '${lVec.id}'`);
    process.exit(1);
  }
  const tsResult = calculateDiscount(config.coupon, lVec.subtotal, config.lines);
  const effectiveShipping = tsResult.freeShipping ? 0 : (lVec.shipping || 0);
  const tsFinalTotal = calculateOrderTotal(lVec.subtotal, tsResult.discountMinor, effectiveShipping);

  if (lVec.discount !== tsResult.discountMinor || Boolean(lVec.freeShipping) !== tsResult.freeShipping || lVec.finalTotal !== tsFinalTotal) {
    console.error(`[lean-verify] ✗ PRICING MISMATCH on vector '${lVec.id}'!`);
    process.exit(1);
  }
  matchedPricingCount++;
}
console.log(`[lean-verify] ✓ All ${matchedPricingCount}/13 Lean 4 Pricing vectors match TypeScript exactly.`);

// --- Verify Theme Vectors (5 vectors) ---
const EXPECTED_THEME_VECTOR_IDS = [
  "tv-legacy-migrate",
  "tv-canonical-preserve",
  "tv-future-reject",
  "tv-invalid-reject",
  "tv-idempotent"
];

if (leanThemeVectors.length !== 5) {
  console.error(`[lean-verify] ✗ THEME VECTOR COUNT MISMATCH: Expected 5, got ${leanThemeVectors.length}!`);
  process.exit(1);
}

const themeFileVectors = JSON.parse(readFileSync(themeVectorsFile, "utf-8"));
const themeVectorMap = new Map(themeFileVectors.map((v) => [v.id, v]));

let matchedThemeCount = 0;
for (const lVec of leanThemeVectors) {
  const fileVec = themeVectorMap.get(lVec.id);
  if (!fileVec) {
    console.error(`[lean-verify] ✗ Unknown theme vector ID: '${lVec.id}'`);
    process.exit(1);
  }

  // Cross-check Lean output with expected vector
  if (
    lVec.status !== fileVec.expected.status ||
    lVec.schema !== fileVec.expected.schema ||
    lVec.isStructured !== fileVec.expected.isStructured ||
    lVec.url !== fileVec.expected.url ||
    lVec.alt !== fileVec.expected.alt ||
    lVec.focalX !== fileVec.expected.focalX ||
    lVec.focalY !== fileVec.expected.focalY ||
    lVec.publishEligible !== fileVec.expected.publishEligible
  ) {
    console.error(`[lean-verify] ✗ THEME VECTOR SPEC MISMATCH on '${lVec.id}':`);
    console.error("  Lean Output:    ", lVec);
    console.error("  Expected Vector:", fileVec.expected);
    process.exit(1);
  }

  // Cross-check Lean output with production TypeScript implementation
  if (lVec.id === "tv-legacy-migrate") {
    const { ast: tsMigrated } = migrateThemeAst(fileVec.input);
    const heroSection = tsMigrated.templates.index.sections[0];
    const imageVal = heroSection.settings.imageUrl;
    if (
      tsMigrated.schemaVersion !== "1.0.0" ||
      typeof imageVal !== "object" ||
      imageVal.url !== lVec.url ||
      imageVal.alt !== lVec.alt ||
      (imageVal.focalPoint?.x ?? 0) !== lVec.focalX ||
      (imageVal.focalPoint?.y ?? 0) !== lVec.focalY
    ) {
      console.error(`[lean-verify] ✗ TypeScript migration mismatch on '${lVec.id}'!`, tsMigrated);
      process.exit(1);
    }
    const valResult = validateThemeAst(tsMigrated);
    if (!valResult.valid) {
      console.error(`[lean-verify] ✗ Migrated document failed TypeScript validation on '${lVec.id}'!`);
      process.exit(1);
    }
  } else if (lVec.id === "tv-canonical-preserve") {
    const { ast: tsMigrated } = migrateThemeAst(fileVec.input);
    const heroSection = tsMigrated.templates.index.sections[0];
    const imageVal = heroSection.settings.imageUrl;
    if (
      tsMigrated.schemaVersion !== "1.0.0" ||
      typeof imageVal !== "object" ||
      imageVal.url !== lVec.url ||
      imageVal.alt !== lVec.alt ||
      imageVal.focalPoint?.x !== lVec.focalX ||
      imageVal.focalPoint?.y !== lVec.focalY
    ) {
      console.error(`[lean-verify] ✗ TypeScript canonical preserve mismatch on '${lVec.id}'!`);
      process.exit(1);
    }
  } else if (lVec.id === "tv-future-reject") {
    // Assert fail-closed rejection
    const authRes = loadAuthoritativeThemeAst(fileVec.input);
    let migrateThrew = false;
    try {
      migrateThemeAst(fileVec.input);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unsupported future schema version")) {
        migrateThrew = true;
      }
    }
    if (authRes.success !== false || !authRes.error?.includes("Unsupported future schema version") || !migrateThrew) {
      console.error(`[lean-verify] ✗ Future schema was NOT rejected by TypeScript loadAuthoritativeThemeAst!`, authRes);
      process.exit(1);
    }
  } else if (lVec.id === "tv-invalid-reject") {
    const valResult = validateThemeAst(fileVec.input);
    if (valResult.valid) {
      console.error(`[lean-verify] ✗ Malformed schema passed TypeScript validation on '${lVec.id}'!`);
      process.exit(1);
    }
  } else if (lVec.id === "tv-idempotent") {
    const { ast: pass1 } = migrateThemeAst(fileVec.input);
    const { ast: pass2 } = migrateThemeAst(pass1);
    if (JSON.stringify(pass1) !== JSON.stringify(pass2)) {
      console.error(`[lean-verify] ✗ TypeScript migration idempotency failed on '${lVec.id}'!`);
      process.exit(1);
    }
  }

  console.log(`  ✓ Theme Vector '${lVec.id}': status=${lVec.status}, schema=${lVec.schema}, structured=${lVec.isStructured}, url=${lVec.url}, focal=(${lVec.focalX},${lVec.focalY}) [Lean ↔ TypeScript match]`);
  matchedThemeCount++;
}

console.log(`\n[lean-verify] SUCCESS: All ${matchedPricingCount}/13 Pricing vectors and ${matchedThemeCount}/5 Theme vectors match production TypeScript exactly.`);
console.log("[lean-verify] Zero discrepancies detected. Formal verification gate PASSED (fail-closed).\n");
