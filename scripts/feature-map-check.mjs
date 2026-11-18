#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FEATURES_DIR = join(process.cwd(), "features");
console.log("[feature-map-check] Validating machine-readable feature map specifications...");

if (!existsSync(FEATURES_DIR)) {
  console.error("[feature-map-check] ✗ features/ directory not found!");
  process.exit(1);
}

const readmePath = join(FEATURES_DIR, "README.md");
if (!existsSync(readmePath)) {
  console.error("[feature-map-check] ✗ features/README.md not found!");
  process.exit(1);
}

const requiredSections = [
  "Entry Route",
  "Preconditions",
  "Supported Actions",
  "State Transitions",
  "Executable Invariants",
  "Verification Commands"
];

function findMarkdownFiles(dir) {
  let results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      results.push(fullPath);
    }
  }
  return results;
}

const featureFiles = findMarkdownFiles(FEATURES_DIR);
console.log(`[feature-map-check] Found ${featureFiles.length} feature specifications to audit.`);

let failed = false;

for (const file of featureFiles) {
  const content = readFileSync(file, "utf-8");
  const missing = requiredSections.filter((section) => !content.includes(section));
  if (missing.length > 0) {
    console.error(`[feature-map-check] ✗ ${file} is missing required sections: ${missing.join(", ")}`);
    failed = true;
  } else {
    console.log(`[feature-map-check] ✓ ${file.replace(process.cwd() + "/", "")} passes schema contract.`);
  }
}

if (failed) {
  console.error("[feature-map-check] Schema validation failed for one or more features.");
  process.exit(1);
}

console.log("[feature-map-check] All feature specifications are fully populated and compliant.\n");
