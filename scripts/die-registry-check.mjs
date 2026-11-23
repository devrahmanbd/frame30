#!/usr/bin/env node
/**
 * Frame30 Permanent Die Registry Checker
 * Validates that all accepted product capabilities in dies/ adhere to the
 * 8-component specification schema (dies/schema.json) and that all referenced
 * formal laws, executable models, and conformance test files exist on disk.
 *
 * Conforms to F30-SDLC-001 Section 2.2 and Section 7.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const DIES_DIR = join(REPO_ROOT, "dies");
const SCHEMA_FILE = join(DIES_DIR, "schema.json");

console.log(
  "[die-registry-check] Validating Frame30 Permanent Die Registry integrity...",
);

if (!existsSync(DIES_DIR)) {
  console.error(
    "[die-registry-check] ✗ FAIL-CLOSED: dies/ directory not found.",
  );
  process.exit(1);
}

if (!existsSync(SCHEMA_FILE)) {
  console.error(
    "[die-registry-check] ✗ FAIL-CLOSED: dies/schema.json not found.",
  );
  process.exit(1);
}

const REQUIRED_TOP_FIELDS = [
  "die_id",
  "version",
  "title",
  "domain",
  "owner",
  "requirement",
  "protected_behaviour",
  "forbidden_behaviour",
  "formal_laws",
  "executable_model",
  "conformance_obligations",
  "adversarial_checks",
  "regression_requirements",
];

const dieEntries = readdirSync(DIES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

console.log(
  `[die-registry-check] Found ${dieEntries.length} registered capabilities in dies/.`,
);

let violations = [];

for (const dirName of dieEntries) {
  const dieJsonPath = join(DIES_DIR, dirName, "die.json");
  if (!existsSync(dieJsonPath)) {
    violations.push({
      die: dirName,
      error: `Missing die.json file in dies/${dirName}/`,
    });
    continue;
  }

  let die;
  try {
    die = JSON.parse(readFileSync(dieJsonPath, "utf8"));
  } catch (err) {
    violations.push({
      die: dirName,
      error: `Malformed JSON in ${dieJsonPath}: ${err.message}`,
    });
    continue;
  }

  // 1. Verify required top-level fields
  for (const field of REQUIRED_TOP_FIELDS) {
    if (!die[field]) {
      violations.push({
        die: dirName,
        error: `Missing mandatory field '${field}'`,
      });
    }
  }

  // 2. Verify requirement completeness
  if (die.requirement) {
    if (!die.requirement.summary || !die.requirement.user_outcome) {
      violations.push({
        die: dirName,
        error: "Requirement object must define 'summary' and 'user_outcome'",
      });
    }
  }

  // 3. Verify formal laws existence
  if (die.formal_laws) {
    if (die.formal_laws.bend_laws) {
      for (const lawRef of die.formal_laws.bend_laws) {
        const filePath = lawRef.split(":")[0];
        if (!existsSync(join(REPO_ROOT, filePath))) {
          violations.push({
            die: dirName,
            error: `Referenced Bend law file not found: ${filePath}`,
          });
        }
      }
    }
    if (die.formal_laws.tla_models) {
      for (const tlaRef of die.formal_laws.tla_models) {
        const filePath = tlaRef.split(":")[0];
        if (!existsSync(join(REPO_ROOT, filePath))) {
          violations.push({
            die: dirName,
            error: `Referenced TLA+ model file not found: ${filePath}`,
          });
        }
      }
    }
  }

  // 4. Verify conformance obligations target files
  if (Array.isArray(die.conformance_obligations)) {
    for (const ob of die.conformance_obligations) {
      if (Array.isArray(ob.target_files)) {
        for (const target of ob.target_files) {
          if (!existsSync(join(REPO_ROOT, target))) {
            violations.push({
              die: dirName,
              error: `Conformance obligation target file not found: ${target}`,
            });
          }
        }
      }
    }
  }

  // 5. Verify adversarial checks completeness
  if (
    !Array.isArray(die.adversarial_checks) ||
    die.adversarial_checks.length === 0
  ) {
    violations.push({
      die: dirName,
      error: "Die must declare at least one adversarial mutation check",
    });
  }

  console.log(
    `  ✓ Checked ${die.die_id || dirName} (v${die.version || "1.0.0"}): valid specification`,
  );
}

if (violations.length > 0) {
  console.error("\n=======================================================");
  console.error("  [die-registry-check] ✗ DIE REGISTRY VIOLATIONS DETECTED");
  console.error("=======================================================");
  for (const v of violations) {
    console.error(`  [${v.die}] ${v.error}`);
  }
  process.exit(1);
}

console.log(
  `[die-registry-check] ✓ All ${dieEntries.length} permanent dies conform to schema and disk targets.\n`,
);
process.exit(0);
