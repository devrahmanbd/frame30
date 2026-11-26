#!/usr/bin/env node
/**
 * Frame30 DICE Evidence & Attestation Engine (Revision 2.3 Section 9.1)
 * RFC 8785 Canonical JSON Serialization + Detached Digest Ledger + Ed25519 DSSE Envelope
 */

import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalizeJson } from "./dice-plan-generator.mjs";

export function serializeReceiptCanonical(receipt) {
  // Ensure no self-referential hash exists in the payload (resolves AUDIT-REV2-006)
  const cleanReceipt = { ...receipt };
  delete cleanReceipt.receipt_sha256;
  delete cleanReceipt.self_hash;

  return canonicalizeJson(cleanReceipt);
}

export function computeReceiptDigest(canonicalReceiptStr) {
  return createHash("sha256").update(canonicalReceiptStr, "utf8").digest("hex");
}

export function generateDetachedDigestLedger(receiptEntries) {
  // receiptEntries: array of { relPath, canonicalStr }
  for (const r of receiptEntries) {
    if (!r.relPath || typeof r.relPath !== "string") {
      throw new Error("Invalid receipt path: must be a non-empty string");
    }
    if (
      r.relPath.includes("\n") ||
      r.relPath.includes("\r") ||
      r.relPath.includes("\0")
    ) {
      throw new Error(
        `Receipt path injection detected: ${JSON.stringify(r.relPath)}`,
      );
    }
  }

  const lines = receiptEntries
    .slice()
    .sort((a, b) =>
      a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
    )
    .map((r) => `${computeReceiptDigest(r.canonicalStr)}  ${r.relPath}`);
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

/**
 * Pre-Authentication Encoding (PAE) according to DSSE v1 specification:
 * PAE(type, body) = "DSSEv1 " + byteLength(type) + " " + type + " " + byteLength(body) + " " + body
 */
export function computePae(payloadType, payloadBytes) {
  const typeBytes = Buffer.from(payloadType, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} `, "utf8"),
    typeBytes,
    Buffer.from(` ${payloadBytes.length} `, "utf8"),
    payloadBytes,
  ]);
}

// In-toto DSSE Envelope Generation with Ed25519
export function createAttestationEnvelope(
  statementObj,
  privateKeyPem,
  keyId = "key-framique-ci-test",
) {
  const canonicalStatement = canonicalizeJson(statementObj);
  const payloadBytes = Buffer.from(canonicalStatement, "utf8");
  const payloadBase64 = payloadBytes.toString("base64");

  const payloadType = "application/vnd.in-toto+json";
  const pae = computePae(payloadType, payloadBytes);

  const signature = sign(null, pae, privateKeyPem);

  return {
    payloadType,
    payload: payloadBase64,
    signatures: [
      {
        keyid: keyId,
        sig: signature.toString("base64"),
      },
    ],
  };
}

export function verifyAttestationEnvelope(envelope, publicKeyPem) {
  if (!envelope || typeof envelope !== "object") {
    return { valid: false, reason: "INVALID_ENVELOPE" };
  }
  if (envelope.payloadType !== "application/vnd.in-toto+json") {
    return { valid: false, reason: "INVALID_PAYLOAD_TYPE" };
  }
  if (!Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    return { valid: false, reason: "MISSING_SIGNATURES" };
  }
  if (typeof envelope.payload !== "string") {
    return { valid: false, reason: "INVALID_PAYLOAD" };
  }

  let payloadBytes;
  try {
    payloadBytes = Buffer.from(envelope.payload, "base64");
  } catch {
    return { valid: false, reason: "MALFORMED_BASE64_PAYLOAD" };
  }

  const pae = computePae(envelope.payloadType, payloadBytes);

  for (const sigObj of envelope.signatures) {
    if (!sigObj || !sigObj.sig || typeof sigObj.sig !== "string") continue;
    try {
      const sigBuffer = Buffer.from(sigObj.sig, "base64");
      const ok = verify(null, pae, publicKeyPem, sigBuffer);
      if (ok) {
        let statement;
        try {
          statement = JSON.parse(payloadBytes.toString("utf8"));
        } catch {
          return { valid: false, reason: "INVALID_JSON_STATEMENT" };
        }
        return { valid: true, keyid: sigObj.keyid, statement };
      }
    } catch {}
  }

  return { valid: false, reason: "SIGNATURE_VERIFICATION_FAILED" };
}

export function generateTestKeypair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

export class DiceSigningAuthority {
  constructor(options = {}) {
    this.trustedKeysPath =
      options.trustedKeysPath || "registries/dice/trusted-keys.json";
    this.trustedKeys = options.trustedKeys || null;
    this.repoRoot = options.repoRoot || process.cwd();
  }

  loadTrustedKeys() {
    if (this.trustedKeys) return this.trustedKeys;
    const fullPath = resolve(this.repoRoot, this.trustedKeysPath);
    if (!existsSync(fullPath)) {
      throw new Error(
        `FAIL-CLOSED: Trusted keys registry not found at ${fullPath}`,
      );
    }
    this.trustedKeys = JSON.parse(readFileSync(fullPath, "utf8"));
    return this.trustedKeys;
  }

  resolveKey(keyId) {
    const keys = this.loadTrustedKeys();
    const keyDef = keys.find((k) => k.keyid === keyId || k.key_id === keyId);
    if (!keyDef) {
      return {
        status: "UNKNOWN_KEY",
        reason: `Key '${keyId}' not registered in trusted-keys.json`,
      };
    }
    if (keyDef.status === "revoked") {
      return {
        status: "REVOKED",
        reason: `Key '${keyId}' was revoked at ${keyDef.revoked_at}`,
        keyDef,
      };
    }
    if (keyDef.status !== "active") {
      return {
        status: "INACTIVE",
        reason: `Key '${keyId}' has non-active status: ${keyDef.status}`,
        keyDef,
      };
    }
    return { status: "ACTIVE", keyDef };
  }

  signAttestation(statementObj, privateKeyPem, keyId, options = {}) {
    // 1. Authoritative key validation
    const keyRes = this.resolveKey(keyId);
    if (keyRes.status !== "ACTIVE") {
      throw new Error(
        `FAIL-CLOSED: Attestation signing rejected: ${keyRes.reason}`,
      );
    }
    const keyDef = keyRes.keyDef;

    // 2. Role authorization check
    const requiredRole = options.requiredRole || "dice-attestation-signer";
    if (!keyDef.roles || !keyDef.roles.includes(requiredRole)) {
      throw new Error(
        `FAIL-CLOSED: Key '${keyId}' lacks authorized role '${requiredRole}'`,
      );
    }

    // 3. Detached receipt digest ledger validation (if ledger provided)
    if (options.ledgerContent && options.receiptsDir) {
      this.validateLedger(options.ledgerContent, options.receiptsDir);
    }

    // 4. In-toto DSSE Envelope Generation with Ed25519
    const envelope = createAttestationEnvelope(
      statementObj,
      privateKeyPem,
      keyId,
    );

    // 5. Immediate self-verification against registered trusted public key
    const verifyRes = verifyAttestationEnvelope(
      envelope,
      keyDef.public_key_pem,
    );
    if (!verifyRes.valid) {
      throw new Error(
        `FAIL-CLOSED: Signed attestation envelope failed immediate verification: ${verifyRes.reason}`,
      );
    }

    return envelope;
  }

  validateLedger(ledgerContent, receiptsDir) {
    const lines = ledgerContent.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 2) continue;
      const [expectedSha, relPath] = parts;
      const cleanRel = relPath.replace(/^receipts\//, "");
      const fullPath = resolve(receiptsDir, cleanRel);
      if (!existsSync(fullPath)) {
        throw new Error(
          `FAIL-CLOSED: Ledger references non-existent receipt: ${relPath}`,
        );
      }
      const canonicalContent = readFileSync(fullPath, "utf8");
      const actualSha = computeReceiptDigest(canonicalContent);
      if (actualSha !== expectedSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt digest mismatch for ${relPath}: expected ${expectedSha}, actual ${actualSha}`,
        );
      }
    }
    return true;
  }

  verifyAttestation(envelope) {
    if (
      !envelope ||
      !Array.isArray(envelope.signatures) ||
      envelope.signatures.length === 0
    ) {
      return { valid: false, reason: "MISSING_SIGNATURES" };
    }

    for (const sig of envelope.signatures) {
      const keyRes = this.resolveKey(sig.keyid);
      if (keyRes.status === "REVOKED") {
        return {
          valid: false,
          reason: `SIGNER_KEY_REVOKED: Key '${sig.keyid}' is revoked`,
          keyid: sig.keyid,
        };
      }
      if (keyRes.status !== "ACTIVE") {
        return {
          valid: false,
          reason: `UNTRUSTED_KEY: ${keyRes.reason}`,
          keyid: sig.keyid,
        };
      }

      const res = verifyAttestationEnvelope(
        envelope,
        keyRes.keyDef.public_key_pem,
      );
      if (res.valid) {
        return { valid: true, keyid: sig.keyid, statement: res.statement };
      }
    }

    return { valid: false, reason: "SIGNATURE_VERIFICATION_FAILED" };
  }
}

export function verifyIndependentAttestation(options = {}) {
  let envelope = options.envelope;
  if (!envelope && options.attestationPath) {
    if (!existsSync(options.attestationPath)) {
      throw new Error(
        `FAIL-CLOSED: Attestation file missing: ${options.attestationPath}`,
      );
    }
    try {
      envelope = JSON.parse(readFileSync(options.attestationPath, "utf8"));
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Malformed attestation JSON: ${err.message}`,
      );
    }
  }

  // 1. DSSE envelope structure
  if (!envelope || typeof envelope !== "object") {
    throw new Error("FAIL-CLOSED: Envelope must be a non-null object");
  }
  if (typeof envelope.payloadType !== "string") {
    throw new Error("FAIL-CLOSED: Envelope payloadType must be a string");
  }
  if (typeof envelope.payload !== "string" || !envelope.payload.trim()) {
    throw new Error("FAIL-CLOSED: Envelope payload must be a non-empty string");
  }
  if (!Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    throw new Error(
      "FAIL-CLOSED: Envelope signatures must be a non-empty array",
    );
  }

  // 2. Payload type
  if (envelope.payloadType !== "application/vnd.in-toto+json") {
    throw new Error(
      `FAIL-CLOSED: Invalid payloadType '${envelope.payloadType}', expected 'application/vnd.in-toto+json'`,
    );
  }

  let payloadBytes;
  try {
    payloadBytes = Buffer.from(envelope.payload, "base64");
  } catch (err) {
    throw new Error(`FAIL-CLOSED: Payload is not valid base64: ${err.message}`);
  }

  // 3. Resolve trusted keys
  let trustedKeys = options.trustedKeys;
  if (!trustedKeys && options.testKeysPath) {
    if (!existsSync(options.testKeysPath)) {
      throw new Error(
        `FAIL-CLOSED: Trusted keys file missing: ${options.testKeysPath}`,
      );
    }
    trustedKeys = JSON.parse(readFileSync(options.testKeysPath, "utf8"));
  } else if (!trustedKeys && options.keysPath) {
    if (!existsSync(options.keysPath)) {
      throw new Error(
        `FAIL-CLOSED: Trusted keys file missing: ${options.keysPath}`,
      );
    }
    trustedKeys = JSON.parse(readFileSync(options.keysPath, "utf8"));
  } else if (!trustedKeys) {
    if (options.distDir) {
      const p = join(options.distDir, "registries/dice/trusted-keys.json");
      if (existsSync(p)) {
        trustedKeys = JSON.parse(readFileSync(p, "utf8"));
      } else {
        throw new Error(
          `FAIL-CLOSED: Authoritative trusted-keys.json missing from protected distribution at ${p}`,
        );
      }
    } else if (
      process.env.DICE_REQUIRE_EXTERNAL_ANCHORS === "1" ||
      options.requireExternalAnchors
    ) {
      throw new Error(
        "FAIL-CLOSED: External trust anchors required, but no external trusted keys provided (BLOCKED)",
      );
    } else {
      const defaultPath = resolve(
        options.repoRoot || process.cwd(),
        "registries/dice/trusted-keys.json",
      );
      if (existsSync(defaultPath)) {
        trustedKeys = JSON.parse(readFileSync(defaultPath, "utf8"));
      } else {
        throw new Error(
          `FAIL-CLOSED: No trusted keys provided and default not found at ${defaultPath}`,
        );
      }
    }
  }

  const signingAuthority = new DiceSigningAuthority({
    trustedKeys,
    repoRoot: options.repoRoot || process.cwd(),
  });

  // Verify signatures, registered public key identity, role and revocation
  const pae = computePae(envelope.payloadType, payloadBytes);
  const requiredRole = options.requiredRole || "dice-attestation-signer";

  let validSignatureFound = false;
  let verifiedKeyId = null;

  for (const sigObj of envelope.signatures) {
    if (!sigObj || typeof sigObj !== "object" || !sigObj.keyid || !sigObj.sig) {
      throw new Error("FAIL-CLOSED: Malformed signature entry in envelope");
    }

    // 4. Registered public key identity
    const keyRes = signingAuthority.resolveKey(sigObj.keyid);
    if (keyRes.status === "UNKNOWN_KEY") {
      throw new Error(
        `FAIL-CLOSED: Signer key '${sigObj.keyid}' is not registered in trusted-keys registry`,
      );
    }

    // 5. Key role and revocation state
    if (keyRes.status === "REVOKED") {
      throw new Error(`FAIL-CLOSED: Signer key '${sigObj.keyid}' is REVOKED`);
    }
    if (keyRes.status !== "ACTIVE") {
      throw new Error(
        `FAIL-CLOSED: Signer key '${sigObj.keyid}' is not active: ${keyRes.status}`,
      );
    }
    const keyDef = keyRes.keyDef;
    if (!keyDef.roles || !keyDef.roles.includes(requiredRole)) {
      throw new Error(
        `FAIL-CLOSED: Signer key '${sigObj.keyid}' lacks authorized role '${requiredRole}'`,
      );
    }

    // 3. Ed25519 signature
    let sigBuffer;
    try {
      sigBuffer = Buffer.from(sigObj.sig, "base64");
    } catch {
      throw new Error(
        `FAIL-CLOSED: Signature for '${sigObj.keyid}' is not valid base64`,
      );
    }

    const verified = verify(null, pae, keyDef.public_key_pem, sigBuffer);
    if (!verified) {
      throw new Error(
        `FAIL-CLOSED: Ed25519 signature verification failed for key '${sigObj.keyid}'`,
      );
    }

    validSignatureFound = true;
    verifiedKeyId = sigObj.keyid;
    break;
  }

  if (!validSignatureFound) {
    throw new Error("FAIL-CLOSED: No valid signature found in envelope");
  }

  // Parse statement
  let statement;
  try {
    statement = JSON.parse(payloadBytes.toString("utf8"));
  } catch (err) {
    throw new Error(
      `FAIL-CLOSED: Envelope payload does not contain valid JSON statement: ${err.message}`,
    );
  }

  if (statement._type !== "https://in-toto.io/Statement/v1") {
    throw new Error(
      `FAIL-CLOSED: Statement _type must be 'https://in-toto.io/Statement/v1', got '${statement._type}'`,
    );
  }

  // 6. Candidate commit and tree
  if (!Array.isArray(statement.subject) || statement.subject.length === 0) {
    throw new Error("FAIL-CLOSED: Statement subject must be a non-empty array");
  }
  const subject = statement.subject[0];
  if (!subject.digest) {
    throw new Error("FAIL-CLOSED: Statement subject missing digest object");
  }

  if (options.candidateTree) {
    if (subject.digest.sha256 !== options.candidateTree) {
      throw new Error(
        `FAIL-CLOSED: Candidate tree SHA mismatch! Statement: ${subject.digest.sha256}, expected: ${options.candidateTree}`,
      );
    }
  }
  if (options.candidateCommit) {
    if (subject.digest.commit !== options.candidateCommit) {
      throw new Error(
        `FAIL-CLOSED: Candidate commit SHA mismatch! Statement: ${subject.digest.commit}, expected: ${options.candidateCommit}`,
      );
    }
  }

  // 7. Qualification predicate
  if (!statement.predicateType || typeof statement.predicateType !== "string") {
    throw new Error("FAIL-CLOSED: Statement missing predicateType");
  }
  if (!statement.predicate || typeof statement.predicate !== "object") {
    throw new Error("FAIL-CLOSED: Statement missing predicate object");
  }

  const isTestPredicate =
    statement.predicateType === "https://framique.com/dice/test-attestation/v1";
  const isProdPredicate =
    statement.predicateType === "https://framique.com/dice/attestation/v1";

  if (!isTestPredicate && !isProdPredicate) {
    throw new Error(
      `FAIL-CLOSED: Unrecognized predicateType: ${statement.predicateType}`,
    );
  }

  if (
    options.expectedPredicateType &&
    statement.predicateType !== options.expectedPredicateType
  ) {
    throw new Error(
      `FAIL-CLOSED: PredicateType mismatch: expected ${options.expectedPredicateType}, got ${statement.predicateType}`,
    );
  }

  if (isTestPredicate) {
    if (
      statement.predicate.qualification !== "TEST_QUALIFIED_NON_AUTHORITATIVE"
    ) {
      throw new Error(
        `FAIL-CLOSED: Test attestation predicate must have qualification 'TEST_QUALIFIED_NON_AUTHORITATIVE', got '${statement.predicate.qualification}'`,
      );
    }
    if (options.enforceProductionRelease) {
      throw new Error(
        "FAIL-CLOSED: Test attestation (TEST_QUALIFIED_NON_AUTHORITATIVE) cannot satisfy production release qualification!",
      );
    }
  } else if (isProdPredicate) {
    if (statement.predicate.qualification !== "QUALIFIED_PASS") {
      throw new Error(
        `FAIL-CLOSED: Production attestation must have qualification 'QUALIFIED_PASS', got '${statement.predicate.qualification}'`,
      );
    }
  }

  if (
    !statement.predicate.plan_hash ||
    !/^[0-9a-f]{64}$/.test(statement.predicate.plan_hash)
  ) {
    throw new Error(
      "FAIL-CLOSED: Statement predicate missing valid plan_hash (64 hex characters)",
    );
  }
  if (!statement.predicate.contract) {
    throw new Error("FAIL-CLOSED: Statement predicate missing contract field");
  }

  // 8. Receipt ledger digest
  let ledgerContent = options.ledgerContent;
  if (!ledgerContent && options.ledgerPath) {
    if (!existsSync(options.ledgerPath)) {
      throw new Error(
        `FAIL-CLOSED: Receipt ledger file missing: ${options.ledgerPath}`,
      );
    }
    ledgerContent = readFileSync(options.ledgerPath, "utf8");
  }

  if (ledgerContent) {
    const computedLedgerSha = computeReceiptDigest(ledgerContent);
    if (statement.predicate.ledger_sha256 !== computedLedgerSha) {
      throw new Error(
        `FAIL-CLOSED: Ledger digest mismatch! Statement: ${statement.predicate.ledger_sha256}, actual: ${computedLedgerSha}`,
      );
    }
  }

  return {
    valid: true,
    keyid: verifiedKeyId,
    predicateType: statement.predicateType,
    qualification: statement.predicate.qualification,
    statement,
  };
}

// Standalone CLI Interface
if (process.argv[1] && process.argv[1].endsWith("dice-evidence.mjs")) {
  let attestationPath = null;
  let testKeysPath = null;
  let keysPath = null;
  let distDir = null;
  let candidateTree = null;
  let candidateCommit = null;
  let ledgerPath = null;
  let expectedPredicateType = null;
  let enforceProductionRelease = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/dice-evidence.mjs [options]

Options:
  --verify-attestation=<path> Path to DSSE attestation JSON
  --test-keys=<path>          Path to test trusted-keys.json
  --keys=<path>               Path to trusted-keys.json
  --dist-dir=<path>           Path to protected external distribution
  --candidate-tree=<sha>      Expected candidate tree SHA
  --candidate-commit=<sha>    Expected candidate commit SHA
  --ledger=<path>             Path to receipts.sha256
  --expected-predicate=<type> Expected predicate type URI
  --enforce-production        Enforce production qualification (reject test attestations)
  --help, -h                  Show this help
`);
      process.exit(0);
    } else if (
      arg.startsWith("--verify-attestation=") ||
      arg.startsWith("--attestation=")
    ) {
      attestationPath = arg.split("=")[1];
    } else if (arg.startsWith("--test-keys=")) {
      testKeysPath = arg.split("=")[1];
    } else if (arg.startsWith("--keys=")) {
      keysPath = arg.split("=")[1];
    } else if (arg.startsWith("--dist-dir=")) {
      distDir = arg.split("=")[1];
    } else if (arg.startsWith("--candidate-tree=")) {
      candidateTree = arg.split("=")[1];
    } else if (arg.startsWith("--candidate-commit=")) {
      candidateCommit = arg.split("=")[1];
    } else if (arg.startsWith("--ledger=")) {
      ledgerPath = arg.split("=")[1];
    } else if (arg.startsWith("--expected-predicate=")) {
      expectedPredicateType = arg.split("=")[1];
    } else if (arg === "--enforce-production") {
      enforceProductionRelease = true;
    }
  }

  if (attestationPath) {
    try {
      const res = verifyIndependentAttestation({
        attestationPath,
        testKeysPath,
        keysPath,
        distDir,
        candidateTree,
        candidateCommit,
        ledgerPath,
        expectedPredicateType,
        enforceProductionRelease,
      });
      console.log(
        `\n[dice-evidence] ✓ Independent DSSE attestation verified: ${res.qualification} (keyid: ${res.keyid})`,
      );
      process.exit(0);
    } catch (err) {
      console.error(`\n[dice-evidence] ✗ FAIL-CLOSED: ${err.message}`);
      process.exit(1);
    }
  }
}
