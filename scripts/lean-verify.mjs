#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { calculateDiscount, calculateOrderTotal } from "../src/lib/commerce/pricing.ts";

const leanDir = join(process.cwd(), "specs", "lean");
const leanFile = join(leanDir, "Framique", "Pricing.lean");
const toolchainFile = join(leanDir, "lean-toolchain");
const lakeFile = join(leanDir, "lakefile.lean");
const mainLeanFile = join(leanDir, "Main.lean");

console.log("[lean-verify] Validating Lean 4 formal specification and production correspondence...");

// 1. Toolchain and files existence check (Fail-closed)
if (!existsSync(leanFile) || !existsSync(toolchainFile) || !existsSync(lakeFile) || !existsSync(mainLeanFile)) {
  console.error("[lean-verify] ✗ Missing Lean 4 specification or toolchain configuration files!");
  process.exit(1);
}

const toolchain = readFileSync(toolchainFile, "utf-8").trim();
console.log(`[lean-verify] Pinned Lean toolchain: ${toolchain}`);

const leanContent = readFileSync(leanFile, "utf-8");
const expectedTheorems = [
  "discount_le_subtotal",
  "final_total_nonneg",
  "fixed_discount_exact",
  "percent_100_exact",
  "bogo_discount_bounded",
  "free_shipping_waives_fee",
  "bogo_zero_cheapest_yields_zero"
];

for (const thm of expectedTheorems) {
  if (!leanContent.includes(thm)) {
    console.error(`[lean-verify] ✗ Missing formal theorem '${thm}' in Pricing.lean!`);
    process.exit(1);
  }
}
console.log(`[lean-verify] ✓ All ${expectedTheorems.length} formal theorems declared in Lean 4 specification.`);

// 2. Locate Lean & Lake binaries (check PATH and ~/.elan/bin)
const elanPath = join(process.env.HOME || "/root", ".elan", "bin");
const envWithPath = {
  ...process.env,
  PATH: `${elanPath}:${process.env.PATH || ""}`
};

let lakeBin = "lake";
let leanBin = "lean";
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
    // Restrict fallback strictly to the documented Darwin dyld segment flag
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
    // Strictly reject all other compiled-executable failures!
    console.error("[lean-verify] ✗ FAIL-CLOSED: Compiled Lean binary execution failed with non-whitelisted error!");
    console.error(errMsg);
    process.exit(1);
  }
}

// 5. Parse compiled Lean outputs
let leanVectors;
try {
  const jsonStart = rawLeanOutput.indexOf("[");
  const jsonEnd = rawLeanOutput.lastIndexOf("]") + 1;
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error("No JSON array found in Lean output");
  }
  leanVectors = JSON.parse(rawLeanOutput.slice(jsonStart, jsonEnd));
} catch (parseErr) {
  console.error("[lean-verify] ✗ Failed to parse JSON output from compiled Lean vector program!");
  console.error("Output received:", rawLeanOutput);
  process.exit(1);
}

console.log(`[lean-verify] Received ${leanVectors.length} formal test vectors evaluated by Lean 4 runtime.`);

// Assert exactly 13 expected unique vector IDs
const EXPECTED_VECTOR_IDS = [
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

if (leanVectors.length !== 13) {
  console.error(`[lean-verify] ✗ VECTOR COUNT MISMATCH: Expected exactly 13 vectors, received ${leanVectors.length}!`);
  process.exit(1);
}

const receivedIds = new Set(leanVectors.map((v) => v.id));
if (receivedIds.size !== 13) {
  console.error(`[lean-verify] ✗ DUPLICATE VECTOR IDS DETECTED: Expected 13 unique IDs, got ${receivedIds.size}!`);
  process.exit(1);
}

for (const expId of EXPECTED_VECTOR_IDS) {
  if (!receivedIds.has(expId)) {
    console.error(`[lean-verify] ✗ MISSING EXPECTED VECTOR ID: '${expId}' not emitted by Lean runtime!`);
    process.exit(1);
  }
}
console.log(`[lean-verify] ✓ Asserted exactly 13 unique expected formal vector IDs from Lean runtime.`);

// 6. Test-Vector Correspondence Check: Compiled Lean vs Production TypeScript
const vectorConfigurations = {
  "fixed-less": {
    coupon: { type: "fixed", amount_minor_int: 2500 },
    lines: []
  },
  "fixed-exact": {
    coupon: { type: "fixed", amount_minor_int: 5000 },
    lines: []
  },
  "fixed-overflow": {
    coupon: { type: "fixed", amount_minor_int: 7500 },
    lines: []
  },
  "fixed-zero": {
    coupon: { type: "fixed", amount_minor_int: 1000 },
    lines: []
  },
  "percent-10": {
    coupon: { type: "percent", percent_off: 10 },
    lines: []
  },
  "percent-25": {
    coupon: { type: "percent", percent_off: 25 },
    lines: []
  },
  "percent-33": {
    coupon: { type: "percent", percent_off: 33 },
    lines: []
  },
  "percent-100": {
    coupon: { type: "percent", percent_off: 100 },
    lines: []
  },
  "percent-150-clamp": {
    coupon: { type: "percent", percent_off: 150 },
    lines: []
  },
  "freeship": {
    coupon: { type: "free_shipping" },
    lines: []
  },
  "bogo-standard": {
    coupon: { type: "bogo", buy_quantity: 1, get_quantity: 1 },
    lines: [
      { unitPriceMinor: 4500, quantity: 2 },
      { unitPriceMinor: 5500, quantity: 2 }
    ]
  },
  "bogo-insufficient-qty": {
    coupon: { type: "bogo", buy_quantity: 2, get_quantity: 1 },
    lines: [
      { unitPriceMinor: 5000, quantity: 2 }
    ]
  },
  "bogo-zero-cheapest": {
    coupon: { type: "bogo", buy_quantity: 1, get_quantity: 1 },
    lines: [
      { unitPriceMinor: 0, quantity: 4 }
    ]
  }
};

let matchedCount = 0;
for (const lVec of leanVectors) {
  const config = vectorConfigurations[lVec.id];
  if (!config) {
    console.error(`[lean-verify] ✗ Unknown vector ID emitted by Lean: '${lVec.id}'`);
    process.exit(1);
  }

  const tsResult = calculateDiscount(config.coupon, lVec.subtotal, config.lines);
  const effectiveShipping = tsResult.freeShipping ? 0 : (lVec.shipping || 0);
  const tsFinalTotal = calculateOrderTotal(lVec.subtotal, tsResult.discountMinor, effectiveShipping);

  if (lVec.discount !== tsResult.discountMinor) {
    console.error(`[lean-verify] ✗ DISCOUNT MISMATCH on vector '${lVec.id}':`);
    console.error(`  Lean 4 value:       ${lVec.discount}`);
    console.error(`  TypeScript value:   ${tsResult.discountMinor}`);
    process.exit(1);
  }

  if (Boolean(lVec.freeShipping) !== tsResult.freeShipping) {
    console.error(`[lean-verify] ✗ FREE SHIPPING FLAG MISMATCH on vector '${lVec.id}':`);
    console.error(`  Lean 4 value:       ${lVec.freeShipping}`);
    console.error(`  TypeScript value:   ${tsResult.freeShipping}`);
    process.exit(1);
  }

  if (lVec.finalTotal !== tsFinalTotal) {
    console.error(`[lean-verify] ✗ FINAL TOTAL MISMATCH on vector '${lVec.id}':`);
    console.error(`  Lean 4 value:       ${lVec.finalTotal}`);
    console.error(`  TypeScript value:   ${tsFinalTotal}`);
    process.exit(1);
  }

  console.log(`  ✓ Vector '${lVec.id}': subtotal=${lVec.subtotal}, ship=${lVec.shipping}, freeShip=${lVec.freeShipping}, discount=${lVec.discount}, finalTotal=${lVec.finalTotal} [Lean ↔ TypeScript match]`);
  matchedCount++;
}

console.log(`\n[lean-verify] SUCCESS: All ${matchedCount}/${leanVectors.length} Lean 4 formal test vectors match production TypeScript exactly.`);
console.log("[lean-verify] Zero discrepancies detected. Formal verification gate PASSED (fail-closed).\n");


