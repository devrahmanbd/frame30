#!/usr/bin/env node
/**
 * Frame30 DICE Deterministic Two-Tier Qualification Engine (Revision 2.3 Section 3.2)
 * Tier 1: Obligation Disposition Disp(o, C)
 * Tier 2: Candidate Qualification Qual(C) with strict precedence:
 * FAIL > BLOCKED > WAIVED > PASS
 */

export const MANDATORY_BASELINE_IDS = Object.freeze([
  "OBL-SYS-SCOPE-GUARD-001",
  "OBL-SYS-DRIFT-GUARD-001",
  "OBL-SYS-DIE-REGISTRY-001",
  "OBL-SYS-SECRETS-SCAN-001",
]);

export function evaluateObligationDisposition(obligationId, receipts, plan, candidateTreeSha, options = {}) {
  const isWaived = plan && plan.obligations && plan.obligations.waived && plan.obligations.waived.includes(obligationId);
  if (isWaived) {
    return { disposition: "DISP_WAIVED", reason: "Approved cryptographic waiver" };
  }

  const obReceipts = (receipts || []).filter((r) => r.obligation_id === obligationId);

  // Missing receipt
  if (obReceipts.length === 0) {
    return { disposition: "DISP_BLOCKED", reason: "MISSING_RECEIPT" };
  }

  // Stale provenance check
  for (const r of obReceipts) {
    if (r.tree_sha !== candidateTreeSha) {
      return { disposition: "DISP_BLOCKED", reason: "STALE_PROVENANCE_TREE_MISMATCH" };
    }
  }

  // Status validity
  const validStatuses = new Set(["PASS", "FAIL", "BLOCKED"]);
  for (const r of obReceipts) {
    if (!validStatuses.has(r.status)) {
      return { disposition: "DISP_BLOCKED", reason: `UNKNOWN_STATUS: ${r.status}` };
    }
  }

  // Obligation definition resolution (for declared methods)
  const obDef = (options.obligationsMap && options.obligationsMap.get(obligationId)) || options.obligationDef;

  if (obDef && Array.isArray(obDef.methods) && obDef.methods.length > 0) {
    // Conjunctive multi-method verification across all declared methods
    const declaredMethods = obDef.methods;
    const methodDispositions = [];

    for (const m of declaredMethods) {
      const mId = m.method_id;
      // Find matching receipts for this method
      const mReceipts = obReceipts.filter((r) => r.method_id === mId || (!r.method_id && declaredMethods.length === 1));

      if (mReceipts.length === 0) {
        return { disposition: "DISP_BLOCKED", reason: `MISSING_METHOD_RECEIPT: ${mId}` };
      }

      if (mReceipts.length > 1) {
        return { disposition: "DISP_BLOCKED", reason: `DUPLICATE_METHOD_RECEIPTS_PROHIBITED: ${mId}` };
      }

      const mReceipt = mReceipts[0];
      methodDispositions.push({
        method_id: mId,
        status: mReceipt.status,
        receipt: mReceipt,
      });
    }

    // Precedence: FAIL > BLOCKED > PASS
    const failedMethod = methodDispositions.find((md) => md.status === "FAIL");
    if (failedMethod) {
      return {
        disposition: "DISP_FAIL",
        reason: failedMethod.receipt.diagnostics || `Method failed verification: ${failedMethod.method_id}`,
        failed_method: failedMethod.method_id,
      };
    }

    const blockedMethod = methodDispositions.find((md) => md.status === "BLOCKED");
    if (blockedMethod) {
      return {
        disposition: "DISP_BLOCKED",
        reason: blockedMethod.receipt.diagnostics || `Method blocked: ${blockedMethod.method_id}`,
        blocked_method: blockedMethod.method_id,
      };
    }

    // All methods verified PASS
    return {
      disposition: "DISP_PASS",
      reason: `All ${declaredMethods.length} declared methods verified cleanly`,
      methods_verified: declaredMethods.length,
    };
  }

  // Fallback for tests without full obligation definitions
  const hasMethodIds = obReceipts.some((r) => r.method_id);
  if (hasMethodIds) {
    const seenMethods = new Set();
    const methodReceipts = [];

    for (const r of obReceipts) {
      const mId = r.method_id || "default";
      if (seenMethods.has(mId)) {
        return { disposition: "DISP_BLOCKED", reason: `DUPLICATE_METHOD_RECEIPTS_PROHIBITED: ${mId}` };
      }
      seenMethods.add(mId);
      methodReceipts.push(r);
    }

    const fail = methodReceipts.find((r) => r.status === "FAIL");
    if (fail) return { disposition: "DISP_FAIL", reason: fail.diagnostics || "Method failure" };

    const block = methodReceipts.find((r) => r.status === "BLOCKED");
    if (block) return { disposition: "DISP_BLOCKED", reason: block.diagnostics || "Method blocked" };

    return { disposition: "DISP_PASS", reason: "All methods verified cleanly" };
  }

  // Single legacy receipt check
  if (obReceipts.length > 1) {
    const statuses = new Set(obReceipts.map((r) => r.status));
    if (statuses.size > 1) {
      return { disposition: "DISP_BLOCKED", reason: "CONFLICTING_DUPLICATE_RECEIPTS" };
    }
    return { disposition: "DISP_BLOCKED", reason: "DUPLICATE_RECEIPTS_PROHIBITED" };
  }

  const receipt = obReceipts[0];
  if (receipt.status === "FAIL") {
    return { disposition: "DISP_FAIL", reason: receipt.diagnostics || "Failure detected" };
  }

  if (receipt.status === "BLOCKED") {
    return { disposition: "DISP_BLOCKED", reason: receipt.diagnostics || "Worker blocked" };
  }

  if (receipt.status === "PASS") {
    return { disposition: "DISP_PASS", reason: "All methods verified cleanly" };
  }

  return { disposition: "DISP_BLOCKED", reason: "UNHANDLED_DISPOSITION" };
}

export function evaluateCandidateQualification(plan, receipts, candidateTreeSha, options = {}) {
  const enforceBaseline = options.enforceBaseline ?? true;

  if (!plan || !plan.obligations) {
    return {
      qualification: "QUALIFIED_BLOCKED",
      reason: "PLAN_INTEGRITY_VIOLATION: Missing plan obligations",
      dispositions: {},
    };
  }

  // Plan integrity check
  const { mandatory = [], selected = [], active = [], waived = [] } = plan.obligations;

  // 1. Uniqueness assertions on all arrays
  function findDuplicates(arr) {
    const seen = new Set();
    const dupes = [];
    for (const id of arr) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    return dupes;
  }

  for (const [name, arr] of [
    ["mandatory", mandatory],
    ["selected", selected],
    ["active", active],
    ["waived", waived],
  ]) {
    const dupes = findDuplicates(arr);
    if (dupes.length > 0) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Duplicate IDs in ${name}: ${dupes.join(", ")}`,
        dispositions: {},
      };
    }
  }

  if (selected.length === 0) {
    return {
      qualification: "QUALIFIED_BLOCKED",
      reason: "PLAN_INTEGRITY_VIOLATION: Empty selected obligation set",
      dispositions: {},
    };
  }

  // 2. Independent Plan Validation: Enforce all 4 baseline obligations exist in mandatory and selected
  if (enforceBaseline) {
    if (mandatory.length === 0) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: "PLAN_INTEGRITY_VIOLATION: Empty mandatory obligation set",
        dispositions: {},
      };
    }
    for (const reqMandatory of MANDATORY_BASELINE_IDS) {
      if (!mandatory.includes(reqMandatory)) {
        return {
          qualification: "QUALIFIED_BLOCKED",
          reason: `PLAN_INTEGRITY_VIOLATION: Required baseline obligation ${reqMandatory} missing from mandatory set`,
          dispositions: {},
        };
      }
      if (!selected.includes(reqMandatory)) {
        return {
          qualification: "QUALIFIED_BLOCKED",
          reason: `PLAN_INTEGRITY_VIOLATION: Mandatory baseline obligation ${reqMandatory} missing from selected set`,
          dispositions: {},
        };
      }
    }
  }

  // 3. Disjoint active and waived (Active \cap Waived = \emptyset)
  const activeSet = new Set(active);
  const waivedSet = new Set(waived);
  for (const a of active) {
    if (waivedSet.has(a)) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Obligation ${a} is present in both active and waived sets`,
        dispositions: {},
      };
    }
  }

  // 4. Check mandatory waiver violation (precedence: waiver of mandatory is an immediate FAIL)
  const waivedMandatory = mandatory.filter((m) => waivedSet.has(m));
  if (waivedMandatory.length > 0) {
    return {
      qualification: "QUALIFIED_FAIL",
      reason: `MANDATORY_WAIVER_PROHIBITED: Attempted to waive ${waivedMandatory.join(", ")}`,
      dispositions: {},
    };
  }

  // 5. Partition Law: Selected = Active \uplus Waived
  const selectedSet = new Set(selected);
  for (const s of selected) {
    if (!activeSet.has(s) && !waivedSet.has(s)) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Selected obligation ${s} is omitted from both active and waived sets`,
        dispositions: {},
      };
    }
  }

  for (const a of active) {
    if (!selectedSet.has(a)) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Unselected obligation ${a} added to active set`,
        dispositions: {},
      };
    }
  }

  for (const w of waived) {
    if (!selectedSet.has(w)) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Waived obligation ${w} is not in selected set`,
        dispositions: {},
      };
    }
  }

  // 6. Mandatory subset of Active (Mandatory \subseteq Active)
  for (const m of mandatory) {
    if (!activeSet.has(m)) {
      return {
        qualification: "QUALIFIED_BLOCKED",
        reason: `PLAN_INTEGRITY_VIOLATION: Mandatory baseline obligation ${m} missing from active set`,
        dispositions: {},
      };
    }
  }

  const dispositions = {};
  const failures = [];
  const blocked = [];
  const passes = [];
  const waivedList = [];

  for (const obId of selected) {
    const disp = evaluateObligationDisposition(obId, receipts, plan, candidateTreeSha, {
      obligationsMap: options.obligationsMap,
    });
    dispositions[obId] = disp;

    if (disp.disposition === "DISP_FAIL") {
      failures.push({ obId, reason: disp.reason });
    } else if (disp.disposition === "DISP_BLOCKED") {
      blocked.push({ obId, reason: disp.reason });
    } else if (disp.disposition === "DISP_PASS") {
      passes.push(obId);
    } else if (disp.disposition === "DISP_WAIVED") {
      waivedList.push(obId);
    }
  }

  // Tier 2 Precedence: FAIL > BLOCKED > WAIVED > PASS
  if (failures.length > 0) {
    return {
      qualification: "QUALIFIED_FAIL",
      reason: `${failures.length} obligations failed verification`,
      failures,
      blocked,
      dispositions,
    };
  }

  if (blocked.length > 0) {
    return {
      qualification: "QUALIFIED_BLOCKED",
      reason: `${blocked.length} obligations blocked or missing receipts`,
      blocked,
      dispositions,
    };
  }

  // All waived (Vacuous pass prevention: waivers alone never grant PASS)
  if (active.length === 0 && waivedList.length === selected.length) {
    return {
      qualification: "QUALIFIED_WAIVED",
      reason: "All selected obligations waived; candidate blocked from merge authorization",
      dispositions,
    };
  }

  // Clean PASS
  if (active.length > 0 && passes.length === active.length) {
    return {
      qualification: "QUALIFIED_PASS",
      reason: "All active obligations verified successfully with valid provenance",
      dispositions,
    };
  }

  return {
    qualification: "QUALIFIED_BLOCKED",
    reason: "INCOMPLETE_QUALIFICATION_STATE",
    dispositions,
  };
}
