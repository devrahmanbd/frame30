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
    if (r.relPath.includes("\n") || r.relPath.includes("\r") || r.relPath.includes("\0")) {
      throw new Error(`Receipt path injection detected: ${JSON.stringify(r.relPath)}`);
    }
  }

  const lines = receiptEntries
    .slice()
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
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
export function createAttestationEnvelope(statementObj, privateKeyPem, keyId = "key-framique-ci-test") {
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
    this.trustedKeysPath = options.trustedKeysPath || "registries/dice/trusted-keys.json";
    this.trustedKeys = options.trustedKeys || null;
    this.repoRoot = options.repoRoot || process.cwd();
  }

  loadTrustedKeys() {
    if (this.trustedKeys) return this.trustedKeys;
    const fullPath = resolve(this.repoRoot, this.trustedKeysPath);
    if (!existsSync(fullPath)) {
      throw new Error(`FAIL-CLOSED: Trusted keys registry not found at ${fullPath}`);
    }
    this.trustedKeys = JSON.parse(readFileSync(fullPath, "utf8"));
    return this.trustedKeys;
  }

  resolveKey(keyId) {
    const keys = this.loadTrustedKeys();
    const keyDef = keys.find((k) => k.keyid === keyId || k.key_id === keyId);
    if (!keyDef) {
      return { status: "UNKNOWN_KEY", reason: `Key '${keyId}' not registered in trusted-keys.json` };
    }
    if (keyDef.status === "revoked") {
      return { status: "REVOKED", reason: `Key '${keyId}' was revoked at ${keyDef.revoked_at}`, keyDef };
    }
    if (keyDef.status !== "active") {
      return { status: "INACTIVE", reason: `Key '${keyId}' has non-active status: ${keyDef.status}`, keyDef };
    }
    return { status: "ACTIVE", keyDef };
  }

  signAttestation(statementObj, privateKeyPem, keyId, options = {}) {
    // 1. Authoritative key validation
    const keyRes = this.resolveKey(keyId);
    if (keyRes.status !== "ACTIVE") {
      throw new Error(`FAIL-CLOSED: Attestation signing rejected: ${keyRes.reason}`);
    }
    const keyDef = keyRes.keyDef;

    // 2. Role authorization check
    const requiredRole = options.requiredRole || "dice-attestation-signer";
    if (!keyDef.roles || !keyDef.roles.includes(requiredRole)) {
      throw new Error(`FAIL-CLOSED: Key '${keyId}' lacks authorized role '${requiredRole}'`);
    }

    // 3. Detached receipt digest ledger validation (if ledger provided)
    if (options.ledgerContent && options.receiptsDir) {
      this.validateLedger(options.ledgerContent, options.receiptsDir);
    }

    // 4. In-toto DSSE Envelope Generation with Ed25519
    const envelope = createAttestationEnvelope(statementObj, privateKeyPem, keyId);

    // 5. Immediate self-verification against registered trusted public key
    const verifyRes = verifyAttestationEnvelope(envelope, keyDef.public_key_pem);
    if (!verifyRes.valid) {
      throw new Error(`FAIL-CLOSED: Signed attestation envelope failed immediate verification: ${verifyRes.reason}`);
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
        throw new Error(`FAIL-CLOSED: Ledger references non-existent receipt: ${relPath}`);
      }
      const canonicalContent = readFileSync(fullPath, "utf8");
      const actualSha = computeReceiptDigest(canonicalContent);
      if (actualSha !== expectedSha) {
        throw new Error(`FAIL-CLOSED: Receipt digest mismatch for ${relPath}: expected ${expectedSha}, actual ${actualSha}`);
      }
    }
    return true;
  }

  verifyAttestation(envelope) {
    if (!envelope || !Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
      return { valid: false, reason: "MISSING_SIGNATURES" };
    }

    for (const sig of envelope.signatures) {
      const keyRes = this.resolveKey(sig.keyid);
      if (keyRes.status === "REVOKED") {
        return { valid: false, reason: `SIGNER_KEY_REVOKED: Key '${sig.keyid}' is revoked`, keyid: sig.keyid };
      }
      if (keyRes.status !== "ACTIVE") {
        return { valid: false, reason: `UNTRUSTED_KEY: ${keyRes.reason}`, keyid: sig.keyid };
      }

      const res = verifyAttestationEnvelope(envelope, keyRes.keyDef.public_key_pem);
      if (res.valid) {
        return { valid: true, keyid: sig.keyid, statement: res.statement };
      }
    }

    return { valid: false, reason: "SIGNATURE_VERIFICATION_FAILED" };
  }
}
