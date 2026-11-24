#!/usr/bin/env node
/**
 * Frame30 DICE Evidence & Attestation Engine (Revision 2.3 Section 9.1)
 * RFC 8785 Canonical JSON Serialization + Detached Digest Ledger + Ed25519 DSSE Envelope
 */

import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
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
