import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const REPO_ROOT = process.cwd();
const SCHEMAS_DIR = join(REPO_ROOT, "schemas/dice");
const REGISTRIES_DIR = join(REPO_ROOT, "registries/dice");

describe("DICE JSON Schemas Conformance & Integrity (Draft 2020-12)", () => {
  let ajv: any;

  beforeAll(() => {
    ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);

    // Register all 6 schemas
    const schemaFiles = [
      "obl.schema.json",
      "xdie.schema.json",
      "domain-pack.schema.json",
      "registry.schema.json",
      "trusted-profile.schema.json",
      "evidence-envelope.schema.json",
    ];

    for (const f of schemaFiles) {
      const fullPath = join(SCHEMAS_DIR, f);
      expect(existsSync(fullPath)).toBe(true);
      const schemaJson = JSON.parse(readFileSync(fullPath, "utf8"));
      ajv.addSchema(schemaJson);
    }
  });

  describe("1. Obligation Schema (obl.schema.json)", () => {
    it("validates authentic system mandatory obligations", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/obl.schema.json");
      expect(validate).toBeDefined();

      const mandatoryObs = JSON.parse(
        readFileSync(join(REGISTRIES_DIR, "mandatory-obligations.json"), "utf8")
      );
      expect(Array.isArray(mandatoryObs)).toBe(true);
      expect(mandatoryObs.length).toBe(4);

      for (const ob of mandatoryObs) {
        const valid = validate(ob);
        expect(valid, JSON.stringify(validate.errors)).toBe(true);
      }
    });

    it("rejects tool-polluted or non-conformant obligation identities (AUDIT-REV2-002)", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/obl.schema.json");
      const invalidOb = {
        obligation_id: "OBL-CMS-LEAN4-001", // Contains tool name, invalid pattern
        name: "Invalid Tool-Polluted Obligation",
        description: "Should be rejected because tool names are excluded from obligation id",
        verification_layer: 4,
        methods: [
          {
            method_id: "METH-TEST-01",
            adapter: "lean4",
            trusted_profile_ref: "PROF-LEAN4-v1",
            target_files: ["specs/lean/Test.lean"],
            oracle: {
              oracle_type: "multi_assert",
              assertions: [{ type: "exit_code", expected: 0 }],
            },
          },
        ],
      };

      const valid = validate(invalidOb);
      expect(valid).toBe(false);
    });

    it("rejects obligations with empty methods array (fail-closed)", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/obl.schema.json");
      const emptyMethodsOb = {
        obligation_id: "OBL-TEST-EMPTY-001",
        name: "Empty Methods Obligation",
        description: "Must fail because minItems is 1",
        verification_layer: 1,
        methods: [],
      };
      expect(validate(emptyMethodsOb)).toBe(false);
    });
  });

  describe("2. Executable Verification Die Schema (xdie.schema.json)", () => {
    it("validates a compliant XDIE manifest with embedded OBLs", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/xdie.schema.json");
      expect(validate).toBeDefined();

      const validXdie = {
        schema_version: "2.3.0",
        xdie_id: "XDIE-SYS-BASELINE-v1.0.0",
        die_ref: "DIE-001-responsive-precedence",
        domain: "system",
        risk_class: "critical",
        obligations: [
          {
            obligation_id: "OBL-SYS-SCOPE_CHECK-001",
            name: "Scope Guard Check",
            description: "Mechanical diff comparison against allowed file list",
            verification_layer: 0,
            methods: [
              {
                method_id: "METH-SCOPE-01",
                adapter: "script",
                trusted_profile_ref: "PROF-SCRIPT-v1",
                target_files: ["scripts/scope-guard.mjs"],
                oracle: {
                  oracle_type: "multi_assert",
                  assertions: [{ type: "exit_code", expected: 0 }],
                },
              },
            ],
          },
        ],
      };

      const valid = validate(validXdie);
      expect(valid, JSON.stringify(validate.errors)).toBe(true);
    });

    it("rejects undeclared properties (additionalProperties: false)", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/xdie.schema.json");
      const badXdie = {
        schema_version: "2.3.0",
        xdie_id: "XDIE-SYS-BAD-v1.0.0",
        die_ref: "DIE-001-responsive-precedence",
        domain: "system",
        risk_class: "critical",
        obligations: [
          {
            obligation_id: "OBL-SYS-TEST-001",
            name: "Test Name Valid",
            description: "Valid description here",
            verification_layer: 1,
            methods: [
              {
                method_id: "METH-T-01",
                adapter: "vitest",
                trusted_profile_ref: "PROF-VITEST-v1",
                target_files: ["test.ts"],
                oracle: { oracle_type: "multi_assert", assertions: [] },
              },
            ],
          },
        ],
        unauthorized_override: true, // Forbidden additional property
      };

      expect(validate(badXdie)).toBe(false);
    });
  });

  describe("3. Domain Pack Schema (domain-pack.schema.json)", () => {
    it("validates a domain pack referencing accepted dies", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/domain-pack.schema.json");
      expect(validate).toBeDefined();

      const validPack = {
        schema_version: "2.3.0",
        pack_id: "PACK-THEME_BUILDER-v1.0.0",
        domain: "theme",
        authority: "@devrahmanbd",
        governance_status: "ACCEPTED",
        dies: ["DIE-001-responsive-precedence"],
        xdies: ["XDIE-THEME-CASCADE-v1.0.0"],
      };

      expect(validate(validPack), JSON.stringify(validate.errors)).toBe(true);
    });
  });

  describe("4. Master Registry Schema (registry.schema.json)", () => {
    it("validates authoritative master registry store", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/registry.schema.json");
      expect(validate).toBeDefined();

      const reg = JSON.parse(readFileSync(join(REGISTRIES_DIR, "registry.json"), "utf8"));
      expect(validate(reg), JSON.stringify(validate.errors)).toBe(true);
      expect(reg.accepted_dies).toContain("DIE-001-responsive-precedence");
      expect(reg.accepted_dies).toContain("DIE-002-collection-composition");
    });
  });

  describe("5. Trusted Profile Schema (trusted-profile.schema.json)", () => {
    it("validates a trusted execution profile without candidate CLI leakage", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/trusted-profile.schema.json");
      expect(validate).toBeDefined();

      const profile = {
        schema_version: "2.3.0",
        profile_id: "PROF-LEAN4-v1",
        adapter: "lean4",
        command_template: "lake build && lake exe framique_verify",
        allowed_cli_args: ["--verbose", "--json"],
        timeout_ms: 60000,
        env_allowlist: ["PATH", "ELAN_HOME"],
        sandboxed: true,
      };

      expect(validate(profile), JSON.stringify(validate.errors)).toBe(true);
    });
  });

  describe("6. Evidence Envelope Schema (evidence-envelope.schema.json)", () => {
    it("validates in-toto / DSSE attestation envelope", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/evidence-envelope.schema.json");
      expect(validate).toBeDefined();

      const envelope = {
        payloadType: "application/vnd.in-toto+json",
        payload: Buffer.from(JSON.stringify({ _type: "https://in-toto.io/Statement/v1" })).toString("base64"),
        signatures: [
          {
            keyid: "key-framique-ci-2026",
            sig: "3a8b2f9011de89a03b54cf",
          },
        ],
      };

      expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    });

    it("rejects envelopes without signatures", () => {
      const validate = ajv.getSchema("https://framique.com/schemas/evidence-envelope.schema.json");
      const badEnvelope = {
        payloadType: "application/vnd.in-toto+json",
        payload: "eyJ...",
        signatures: [],
      };
      expect(validate(badEnvelope)).toBe(false);
    });
  });
});
