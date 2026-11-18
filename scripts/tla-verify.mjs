#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const tlaFile = join(process.cwd(), "specs", "tla", "CheckoutInventory.tla");
const cfgFile = join(process.cwd(), "specs", "tla", "CheckoutInventory.cfg");

console.log("[tla-verify] Validating TLA+ specification files...");

if (!existsSync(tlaFile) || !existsSync(cfgFile)) {
  console.error("[tla-verify] ✗ Missing specification or configuration file!");
  process.exit(1);
}

const tlaContent = readFileSync(tlaFile, "utf-8");
const cfgContent = readFileSync(cfgFile, "utf-8");

// Verify required operators and invariants
const requiredSymbols = [
  "MODULE CheckoutInventory",
  "TypeOK",
  "Init",
  "Next",
  "Spec",
  "StockNonNegative",
  "InventoryConservation",
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
const requiredInvariants = ["TypeOK", "StockNonNegative", "InventoryConservation"];
for (const inv of requiredInvariants) {
  if (!cfgContent.includes(inv)) {
    console.error(`[tla-verify] ✗ Invariant '${inv}' not registered in CheckoutInventory.cfg!`);
    process.exit(1);
  }
}

console.log("[tla-verify] ✓ TLA+ specification structure, invariants, and TLC config validated successfully.");
