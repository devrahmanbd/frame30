import { describe, it, expect } from "vitest";
import {
  evaluateObligationDisposition,
  evaluateCandidateQualification,
  MANDATORY_BASELINE_IDS,
} from "../../../scripts/dice-qualify.mjs";

describe("DICE Deterministic Two-Tier Qualification Engine (Revision 2.3 Section 3.2 & C5)", () => {
  const treeSha = "3fc7226b47369e804b9f17bd8051cb68207a6952";
  const standardPlan = {
    obligations: {
      mandatory: [
        "OBL-SYS-SCOPE-GUARD-001",
        "OBL-SYS-DRIFT-GUARD-001",
        "OBL-SYS-DIE-REGISTRY-001",
        "OBL-SYS-SECRETS-SCAN-001",
      ],
      selected: [
        "OBL-SYS-SCOPE-GUARD-001",
        "OBL-SYS-DRIFT-GUARD-001",
        "OBL-SYS-DIE-REGISTRY-001",
        "OBL-SYS-SECRETS-SCAN-001",
        "OBL-CMS-RLS-001",
      ],
      active: [
        "OBL-SYS-SCOPE-GUARD-001",
        "OBL-SYS-DRIFT-GUARD-001",
        "OBL-SYS-DIE-REGISTRY-001",
        "OBL-SYS-SECRETS-SCAN-001",
        "OBL-CMS-RLS-001",
      ],
      waived: [],
    },
  };

  const makeReceipt = (id: string, status: string, overrides = {}) => ({
    obligation_id: id,
    status,
    tree_sha: treeSha,
    diagnostics: `Execution status: ${status}`,
    ...overrides,
  });

  describe("Tier 1: Obligation Disposition (Disp(o, C))", () => {
    it("Row 1: evaluates DISP_PASS when single receipt reports PASS", () => {
      const receipts = [makeReceipt("OBL-CMS-RLS-001", "PASS")];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_PASS");
    });

    it("Row 2: evaluates DISP_FAIL when a receipt reports FAIL", () => {
      const receipts = [makeReceipt("OBL-CMS-RLS-001", "FAIL")];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_FAIL");
    });

    it("Row 3: evaluates DISP_BLOCKED on missing receipts (empty result)", () => {
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", [], standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toBe("MISSING_RECEIPT");
    });

    it("Row 4: evaluates DISP_BLOCKED on conflicting duplicate receipts", () => {
      const receipts = [
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
        makeReceipt("OBL-CMS-RLS-001", "FAIL"),
      ];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toBe("CONFLICTING_DUPLICATE_RECEIPTS");
    });

    it("Row 5: evaluates DISP_BLOCKED on identical duplicate receipts (DUPLICATE_RECEIPTS_PROHIBITED)", () => {
      const receipts = [
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
      ];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toBe("DUPLICATE_RECEIPTS_PROHIBITED");
    });

    it("Row 6: evaluates DISP_BLOCKED on stale provenance (tree_sha mismatch)", () => {
      const receipts = [makeReceipt("OBL-CMS-RLS-001", "PASS", { tree_sha: "stale-tree-sha" })];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toBe("STALE_PROVENANCE_TREE_MISMATCH");
    });

    it("Row 7: evaluates DISP_BLOCKED on unknown status strings", () => {
      const receipts = [makeReceipt("OBL-CMS-RLS-001", "SOMETHING_ELSE")];
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", receipts, standardPlan, treeSha);
      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toContain("UNKNOWN_STATUS");
    });

    it("Row 8: evaluates DISP_WAIVED when obligation is in waived set", () => {
      const waivedPlan = {
        obligations: {
          ...standardPlan.obligations,
          waived: ["OBL-CMS-RLS-001"],
          active: standardPlan.obligations.mandatory,
        },
      };
      const disp = evaluateObligationDisposition("OBL-CMS-RLS-001", [], waivedPlan, treeSha);
      expect(disp.disposition).toBe("DISP_WAIVED");
    });
  });

  describe("Tier 2: Candidate Qualification (Qual(C)) & Precedence", () => {
    it("Row 9: evaluates QUALIFIED_PASS when all active obligations pass", () => {
      const receipts = standardPlan.obligations.active.map((id) => makeReceipt(id, "PASS"));
      const result = evaluateCandidateQualification(standardPlan, receipts, treeSha);
      expect(result.qualification).toBe("QUALIFIED_PASS");
    });

    it("Row 10: evaluates QUALIFIED_FAIL when any active obligation fails", () => {
      const receipts = [
        makeReceipt("OBL-SYS-SCOPE-GUARD-001", "PASS"),
        makeReceipt("OBL-SYS-DRIFT-GUARD-001", "FAIL"),
        makeReceipt("OBL-SYS-DIE-REGISTRY-001", "PASS"),
        makeReceipt("OBL-SYS-SECRETS-SCAN-001", "PASS"),
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
      ];
      const result: any = evaluateCandidateQualification(standardPlan, receipts, treeSha);
      expect(result.qualification).toBe("QUALIFIED_FAIL");
      expect(result.failures.length).toBe(1);
    });

    it("Row 11: evaluates QUALIFIED_BLOCKED on partial execution (missing active receipt)", () => {
      const receipts = [
        makeReceipt("OBL-SYS-SCOPE-GUARD-001", "PASS"),
        // OBL-SYS-DRIFT-GUARD-001 missing!
        makeReceipt("OBL-SYS-DIE-REGISTRY-001", "PASS"),
        makeReceipt("OBL-SYS-SECRETS-SCAN-001", "PASS"),
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
      ];
      const result: any = evaluateCandidateQualification(standardPlan, receipts, treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.blocked.some((b: any) => b.obId === "OBL-SYS-DRIFT-GUARD-001")).toBe(true);
    });

    it("Row 12: strict precedence FAIL > BLOCKED (preserves BLOCKED diagnostics)", () => {
      const receipts = [
        makeReceipt("OBL-SYS-SCOPE-GUARD-001", "PASS"),
        makeReceipt("OBL-SYS-DRIFT-GUARD-001", "FAIL"),
        makeReceipt("OBL-SYS-DIE-REGISTRY-001", "BLOCKED"),
        makeReceipt("OBL-SYS-SECRETS-SCAN-001", "PASS"),
        makeReceipt("OBL-CMS-RLS-001", "PASS"),
      ];
      const result: any = evaluateCandidateQualification(standardPlan, receipts, treeSha);
      expect(result.qualification).toBe("QUALIFIED_FAIL");
      expect(result.failures.length).toBe(1);
      expect(result.blocked.length).toBe(1);
      expect(result.blocked[0].obId).toBe("OBL-SYS-DIE-REGISTRY-001");
    });

    it("Row 13: evaluates QUALIFIED_FAIL on mandatory obligation waiver attempt", () => {
      const illegalWaiverPlan = {
        obligations: {
          mandatory: ["OBL-SYS-SCOPE-GUARD-001"],
          selected: ["OBL-SYS-SCOPE-GUARD-001"],
          active: [],
          waived: ["OBL-SYS-SCOPE-GUARD-001"],
        },
      };
      const result = evaluateCandidateQualification(illegalWaiverPlan, [], treeSha, { enforceBaseline: false });
      expect(result.qualification).toBe("QUALIFIED_FAIL");
      expect(result.reason).toContain("MANDATORY_WAIVER_PROHIBITED");
    });

    it("Row 14: evaluates QUALIFIED_WAIVED when all obligations are waived (blocks merge)", () => {
      const allWaivedPlan = {
        obligations: {
          mandatory: [],
          selected: ["OBL-THEME-CUSTOM-001"],
          active: [],
          waived: ["OBL-THEME-CUSTOM-001"],
        },
      };
      const result = evaluateCandidateQualification(allWaivedPlan, [], treeSha, { enforceBaseline: false });
      expect(result.qualification).toBe("QUALIFIED_WAIVED");
      expect(result.reason).toContain("candidate blocked from merge authorization");
    });

    it("Plan Integrity: rejects empty plan as QUALIFIED_BLOCKED", () => {
      const emptyPlan = { obligations: { mandatory: [], selected: [], active: [], waived: [] } };
      const result = evaluateCandidateQualification(emptyPlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
    });

    it("Plan Integrity: rejects plan missing mandatory baseline obligations independently", () => {
      const incompletePlan = {
        obligations: {
          mandatory: ["OBL-SYS-SCOPE-GUARD-001"], // Missing 3 baseline obligations!
          selected: ["OBL-SYS-SCOPE-GUARD-001"],
          active: ["OBL-SYS-SCOPE-GUARD-001"],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(incompletePlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("OBL-SYS-DRIFT-GUARD-001");
    });

    it("Plan Integrity: rejects plan where selected omits mandatory baseline obligation", () => {
      const tamperedPlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            // OBL-SYS-DRIFT-GUARD-001 omitted from selected!
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(tamperedPlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("OBL-SYS-DRIFT-GUARD-001 missing from selected set");
    });

    it("Plan Integrity: rejects plan where mandatory OBL is omitted from active", () => {
      const omittedActivePlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            // OBL-SYS-DRIFT-GUARD-001 omitted from active!
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(omittedActivePlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("omitted from both active and waived sets");
    });

    it("Plan Integrity: rejects plan where selected OBL is omitted from both active and waived", () => {
      const omittedPlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
            "OBL-CMS-RLS-001", // in selected, but neither in active nor waived
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(omittedPlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("Selected obligation OBL-CMS-RLS-001 is omitted from both active and waived sets");
    });

    it("Plan Integrity: rejects plan where unselected OBL is added to active", () => {
      const unselectedInActivePlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
            "OBL-CMS-RLS-001", // in active, but not in selected!
          ],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(unselectedInActivePlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("Unselected obligation OBL-CMS-RLS-001 added to active set");
    });

    it("Plan Integrity: rejects duplicate IDs in any obligation list", () => {
      const duplicatePlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-SCOPE-GUARD-001", // DUPLICATE in selected!
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          waived: [],
        },
      };
      const result = evaluateCandidateQualification(duplicatePlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("Duplicate IDs in selected: OBL-SYS-SCOPE-GUARD-001");
    });

    it("Plan Integrity: rejects plan with active and waived overlap", () => {
      const overlapPlan = {
        obligations: {
          mandatory: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
          ],
          selected: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
            "OBL-THEME-001",
          ],
          active: [
            "OBL-SYS-SCOPE-GUARD-001",
            "OBL-SYS-DRIFT-GUARD-001",
            "OBL-SYS-DIE-REGISTRY-001",
            "OBL-SYS-SECRETS-SCAN-001",
            "OBL-THEME-001", // in both active and waived!
          ],
          waived: ["OBL-THEME-001"],
        },
      };
      const result = evaluateCandidateQualification(overlapPlan, [], treeSha);
      expect(result.qualification).toBe("QUALIFIED_BLOCKED");
      expect(result.reason).toContain("PLAN_INTEGRITY_VIOLATION");
      expect(result.reason).toContain("OBL-THEME-001 is present in both active and waived sets");
    });
  });
});
