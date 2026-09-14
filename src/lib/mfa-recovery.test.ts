import { describe, expect, it } from "vitest";
import {
  encodeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  isWellFormedRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./mfa-recovery";

describe("recovery codes — shape", () => {
  it("formats entropy as three readable groups", () => {
    const code = encodeRecoveryCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("never emits ambiguous glyphs", () => {
    for (const code of generateRecoveryCodes(20)) {
      expect(code.replace(/-/g, "")).not.toMatch(/[ILOU01]/);
    }
  });

  it("issues the full unique set", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  });
});

describe("recovery codes — input tolerance", () => {
  it("accepts lowercase, spaced and dash-free retypes", () => {
    const code = generateRecoveryCodes(1)[0]!;
    const messy = code.toLowerCase().replace(/-/g, " ");
    expect(normalizeRecoveryCode(messy)).toBe(normalizeRecoveryCode(code));
    expect(isWellFormedRecoveryCode(messy)).toBe(true);
  });

  it("rejects wrong length and out-of-alphabet input (deny case)", () => {
    expect(isWellFormedRecoveryCode("ABCD-EFGH")).toBe(false);
    expect(isWellFormedRecoveryCode("ILOU-ILOU-ILOU")).toBe(false);
    expect(isWellFormedRecoveryCode("")).toBe(false);
  });
});

describe("recovery codes — hashing", () => {
  const salt = "test-salt";

  it("is deterministic for the same user and code (replay case)", async () => {
    const a = await hashRecoveryCode("user-1", "ABCD-EFGH-JKMN", salt);
    const b = await hashRecoveryCode("user-1", "abcd efgh jkmn", salt);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds the digest to the user id", async () => {
    const a = await hashRecoveryCode("user-1", "ABCD-EFGH-JKMN", salt);
    const b = await hashRecoveryCode("user-2", "ABCD-EFGH-JKMN", salt);
    expect(a).not.toBe(b);
  });

  it("binds the digest to the salt", async () => {
    const a = await hashRecoveryCode("user-1", "ABCD-EFGH-JKMN", salt);
    const b = await hashRecoveryCode("user-1", "ABCD-EFGH-JKMN", "other-salt");
    expect(a).not.toBe(b);
  });

  it("never contains the plaintext code", async () => {
    const code = generateRecoveryCodes(1)[0]!;
    const hash = await hashRecoveryCode("user-1", code, salt);
    expect(hash).not.toContain(normalizeRecoveryCode(code));
  });
});
