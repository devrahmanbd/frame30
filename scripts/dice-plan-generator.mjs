#!/usr/bin/env node
/**
 * Frame30 DICE Frozen Plan Generator (Revision 2.3)
 * Pre-computes immutable verification plan P_C prior to worker dispatch.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const REPO_ROOT = process.cwd();

// RFC 8785 JSON Canonicalization Scheme (JCS)
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalizeJson(item)).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => JSON.stringify(k) + ":" + canonicalizeJson(obj[k]));
  return "{" + pairs.join(",") + "}";
}

export function computePlanHash(plan) {
  const canonical = canonicalizeJson(plan);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function loadMandatoryObligations(registryPath) {
  const p = registryPath || join(REPO_ROOT, "registries/dice/mandatory-obligations.json");
  if (!existsSync(p)) {
    throw new Error(`[dice-plan] FAIL-CLOSED: Mandatory obligations registry not found at ${p}`);
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(raw) || raw.length < 4) {
    throw new Error("[dice-plan] FAIL-CLOSED: Invariant 1 violated - Mandatory obligations must contain >= 4 items");
  }
  return raw;
}

export function generateFrozenPlan(options = {}) {
  const {
    candidateCommit = "0000000000000000000000000000000000000000",
    candidateTree = "0000000000000000000000000000000000000000",
    selectedObligations = [],
    waivedObligations = [],
    registryPath,
  } = options;

  const mandatoryList = loadMandatoryObligations(registryPath);
  const mandatoryIds = mandatoryList.map((o) => o.obligation_id).sort();

  // Validate Invariant 3: Mandatory obligations cannot be waived
  for (const w of waivedObligations) {
    if (mandatoryIds.includes(w)) {
      throw new Error(`[dice-plan] FAIL-CLOSED: Invariant 3 violated - Mandatory obligation ${w} cannot be waived`);
    }
  }

  // Selected = Mandatory union ImpactSelected
  const selSet = new Set([...mandatoryIds, ...selectedObligations]);
  const sortedSel = Array.from(selSet).sort();

  if (sortedSel.length === 0) {
    throw new Error("[dice-plan] FAIL-CLOSED: Invariant 1 violated - Empty plan is strictly prohibited");
  }

  const waivedSet = new Set(waivedObligations);
  const sortedWaived = Array.from(waivedSet).sort();

  // Active = Selected - Waived
  const activeSet = new Set(sortedSel.filter((id) => !waivedSet.has(id)));
  const sortedActive = Array.from(activeSet).sort();

  const plan = {
    schema_version: "2.3.0",
    candidate: {
      commit_sha: candidateCommit,
      tree_sha: candidateTree,
    },
    obligations: {
      mandatory: mandatoryIds,
      selected: sortedSel,
      active: sortedActive,
      waived: sortedWaived,
    },
    compiled_at: options.compiledAt || "2026-11-24T12:00:00Z",
  };

  const planHash = computePlanHash(plan);

  return {
    plan,
    planHash,
  };
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("dice-plan-generator.mjs")) {
  try {
    const result = generateFrozenPlan();
    console.log(`[dice-plan] Frozen plan compiled successfully.`);
    console.log(`[dice-plan] Plan SHA-256: ${result.planHash}`);
    console.log(`[dice-plan] Active obligations: ${result.plan.obligations.active.length}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
