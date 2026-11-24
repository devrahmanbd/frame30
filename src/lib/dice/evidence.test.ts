import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  serializeReceiptCanonical,
  computeReceiptDigest,
  generateDetachedDigestLedger,
  createAttestationEnvelope,
  verifyAttestationEnvelope,
  generateTestKeypair,
  computePae,
} from "../../../scripts/dice-evidence.mjs";
import { canonicalizeJson } from "../../../scripts/dice-plan-generator.mjs";

describe("DICE Evidence Authenticity & Cryptographic Attestation (Revision 2.3 Section 9 & C6)", () => {
  describe("1. RFC 8785 Canonical JSON & No Self-Hash Paradox", () => {
    it("omits internal self-referential hashes during serialization (AUDIT-REV2-006)", () => {
      const receipt = {
        obligation_id: "OBL-CMS-RLS-001",
        status: "PASS",
        receipt_sha256: "illegal-circular-hash",
        self_hash: "recursive-paradox",
        tree_sha: "3fc7226b47369e804b9f17bd8051cb68207a6952",
      };

      const canonicalStr = serializeReceiptCanonical(receipt);
      expect(canonicalStr).not.toContain("receipt_sha256");
      expect(canonicalStr).not.toContain("self_hash");
      expect(canonicalStr).toContain("OBL-CMS-RLS-001");

      const digest = computeReceiptDigest(canonicalStr);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("generates deterministic detached digest ledger (receipts.sha256)", () => {
      const r1 = serializeReceiptCanonical({ id: "OBL-B", status: "PASS" });
      const r2 = serializeReceiptCanonical({ id: "OBL-A", status: "PASS" });

      const ledger = generateDetachedDigestLedger([
        { relPath: "receipts/obl-b.json", canonicalStr: r1 },
        { relPath: "receipts/obl-a.json", canonicalStr: r2 },
      ]);

      const lines = ledger.trim().split("\n");
      expect(lines.length).toBe(2);
      // Alphabetical sorting of paths
      expect(lines[0]).toContain("receipts/obl-a.json");
      expect(lines[1]).toContain("receipts/obl-b.json");
    });

    it("rejects path injection attempts (newlines or null bytes) in receipts ledger", () => {
      const r = serializeReceiptCanonical({ id: "OBL-X", status: "PASS" });
      expect(() =>
        generateDetachedDigestLedger([
          { relPath: "receipts/normal.json\n0000000000000000  forged.json", canonicalStr: r },
        ])
      ).toThrow(/Receipt path injection detected/);

      expect(() =>
        generateDetachedDigestLedger([
          { relPath: "receipts/normal.json\r0000000000000000  forged.json", canonicalStr: r },
        ])
      ).toThrow(/Receipt path injection detected/);
    });

    it("RFC 8785: Canonicalizes Unicode characters and key sorting correctly", () => {
      // RFC 8785 mandates sorting by UTF-16 code units
      const input = {
        "\u20ac": "Euro",
        b: "beta",
        a: "alpha",
        "1": "one",
      };
      const canonical = canonicalizeJson(input);
      expect(canonical).toBe('{"1":"one","a":"alpha","b":"beta","\u20ac":"Euro"}');
    });
  });

  describe("2. Ed25519 DSSE Attestation Envelope & Signature Verification", () => {
    it("creates and verifies DSSE in-toto attestation envelope using ephemeral Ed25519 keypair", () => {
      const keypair = generateTestKeypair();
      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: "frame30-candidate", digest: { sha256: "3fc7226b47369e804b9f17bd8051cb68207a6952" } }],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: {
          qualification: "QUALIFIED_PASS",
          obligations_verified: 5,
        },
      };

      const envelope = createAttestationEnvelope(statement, keypair.privateKey, "key-test-ci-01");
      expect(envelope.payloadType).toBe("application/vnd.in-toto+json");
      expect(envelope.signatures.length).toBe(1);

      const verifyResult = verifyAttestationEnvelope(envelope, keypair.publicKey);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.keyid).toBe("key-test-ci-01");
      expect(verifyResult.statement.predicate.qualification).toBe("QUALIFIED_PASS");
    });

    it("DSSE PAE correctly calculates UTF-8 byte lengths for non-ASCII Unicode statements (বাংলা)", () => {
      const keypair = generateTestKeypair();
      const unicodeStatement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: "বাংলাদেশ-কমার্স", digest: { sha256: "3fc7226b47369e804b9f17bd8051cb68207a6952" } }],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: {
          merchant: "বাংলাদেশ",
          currency: "৳",
          location: "ঢাকা",
          note: "স্বতন্ত্র প্রমাণ-ভিত্তিক যাচাইকরণ",
        },
      };

      const canonicalStr = canonicalizeJson(unicodeStatement);
      const strCharCount = canonicalStr.length;
      const utf8ByteCount = Buffer.byteLength(canonicalStr, "utf8");

      // Verify non-ASCII: byte length must be strictly greater than character count
      expect(utf8ByteCount).toBeGreaterThan(strCharCount);

      const envelope = createAttestationEnvelope(unicodeStatement, keypair.privateKey, "key-unicode-01");
      const verifyResult = verifyAttestationEnvelope(envelope, keypair.publicKey);

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.statement.predicate.merchant).toBe("বাংলাদেশ");
      expect(verifyResult.statement.predicate.currency).toBe("৳");

      // Verify that PAE header explicitly contains the byte count, NOT the character count
      const payloadBytes = Buffer.from(envelope.payload, "base64");
      const pae = computePae(envelope.payloadType, payloadBytes);
      const paeHeader = pae.slice(0, 80).toString("utf8");

      expect(paeHeader).toContain(` ${utf8ByteCount} `);
      expect(paeHeader).not.toContain(` ${strCharCount} `);
    });

    it("detects tampering when statement payload is altered post-signing", () => {
      const keypair = generateTestKeypair();
      const statement = { qualification: "QUALIFIED_PASS" };
      const envelope = createAttestationEnvelope(statement, keypair.privateKey);

      // Tamper with payload
      const tamperedStatement = { qualification: "QUALIFIED_FAIL" };
      envelope.payload = Buffer.from(JSON.stringify(tamperedStatement)).toString("base64");

      const verifyResult = verifyAttestationEnvelope(envelope, keypair.publicKey);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe("SIGNATURE_VERIFICATION_FAILED");
    });

    it("validates envelope against schemas/dice/evidence-envelope.schema.json", () => {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      const schemaPath = join(process.cwd(), "schemas/dice/evidence-envelope.schema.json");
      const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
      const validate = ajv.compile(schema);

      const keypair = generateTestKeypair();
      const envelope = createAttestationEnvelope({ test: true }, keypair.privateKey);

      const valid = validate(envelope);
      expect(valid, JSON.stringify(validate.errors)).toBe(true);
    });
  });

  describe("3. Stage 2.2 Authoritative Evidence Integration & Provenance Binding", () => {
    it("binds full candidate provenance and toolchain identity in canonical receipts", () => {
      const receipt = {
        obligation_id: "OBL-SYS-SCOPE-GUARD-001",
        status: "PASS",
        verdict: "PASS",
        candidate_commit: "1c3746ee4685d351122b4fa91532667b0f92a268",
        candidate_tree: "a31978ed1b22da5c6bdde7a4dbb9a6ac3705f53b",
        tree_sha: "a31978ed1b22da5c6bdde7a4dbb9a6ac3705f53b",
        specification_hash: "8e6e3e41bf55ddddfb2aecaefe242e19954fea8cebaa30b46dabcb7ef54ed35f",
        toolchain_identity: {
          node: "v20.18.0",
          bwrap: "bubblewrap 0.4.1",
          platform: "linux",
          arch: "x64",
        },
        invocation: {
          command: ["node", "scripts/scope-guard.mjs", "--contract=features/contracts/F30-DICE-STAGE2-2.json"],
          duration_ms: 125,
          started_at: "2026-11-24T12:00:00.000Z",
        },
        stdout_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        stderr_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        exit_code: 0,
        diagnostics: "[scope-guard] ✓ Scope guard PASSED.",
      };

      const canonicalStr = serializeReceiptCanonical(receipt);
      expect(canonicalStr).toContain('"candidate_commit":"1c3746ee4685d351122b4fa91532667b0f92a268"');
      expect(canonicalStr).toContain('"candidate_tree":"a31978ed1b22da5c6bdde7a4dbb9a6ac3705f53b"');
      expect(canonicalStr).toContain('"bwrap":"bubblewrap 0.4.1"');

      const digest = computeReceiptDigest(canonicalStr);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("verifies detached digest ledger integrity against individual receipt digests", () => {
      const r1 = serializeReceiptCanonical({ obligation_id: "OBL-A", status: "PASS", tree_sha: "tree1" });
      const r2 = serializeReceiptCanonical({ obligation_id: "OBL-B", status: "PASS", tree_sha: "tree1" });

      const d1 = computeReceiptDigest(r1);
      const d2 = computeReceiptDigest(r2);

      const ledger = generateDetachedDigestLedger([
        { relPath: "receipts/OBL-A.json", canonicalStr: r1 },
        { relPath: "receipts/OBL-B.json", canonicalStr: r2 },
      ]);

      const lines = ledger.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(lines[0]).toBe(`${d1}  receipts/OBL-A.json`);
      expect(lines[1]).toBe(`${d2}  receipts/OBL-B.json`);
    });

    it("creates end-to-end DSSE attestation envelope binding qualification to detached ledger", () => {
      const keypair = generateTestKeypair();
      const ledgerDigest = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [
          {
            name: "frame30-candidate",
            digest: {
              sha256: "a31978ed1b22da5c6bdde7a4dbb9a6ac3705f53b",
              commit: "1c3746ee4685d351122b4fa91532667b0f92a268",
            },
          },
        ],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: {
          qualification: "QUALIFIED_PASS",
          plan_hash: "8e6e3e41bf55ddddfb2aecaefe242e19954fea8cebaa30b46dabcb7ef54ed35f",
          contract: "F30-DICE-STAGE2-2",
          obligations_verified: 4,
          toolchain: {
            node: process.version,
            bwrap: "bubblewrap 0.4.1",
          },
          ledger_sha256: ledgerDigest,
        },
      };

      const envelope = createAttestationEnvelope(statement, keypair.privateKey, "key-stage2-2-ci");
      const verifyResult = verifyAttestationEnvelope(envelope, keypair.publicKey);

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.statement.predicate.qualification).toBe("QUALIFIED_PASS");
      expect(verifyResult.statement.predicate.ledger_sha256).toBe(ledgerDigest);
      expect(verifyResult.statement.subject[0].digest.commit).toBe("1c3746ee4685d351122b4fa91532667b0f92a268");
    });
  });
});
