/**
 * TOTP recovery codes (BUILD.md §1.2).
 *
 * Pure, runtime-agnostic half: generation, normalisation and hashing. A code is
 * shown to the human exactly once; only a salted SHA-256 digest is ever stored,
 * so a database read cannot recover a usable code. The digest is bound to the
 * user id, so a leaked hash from one account cannot be replayed on another.
 */

/** Crockford-ish alphabet: no I, L, O, U — unambiguous when read off paper. */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_GROUPS = 3;
export const RECOVERY_CODE_GROUP_SIZE = 4;

/** Formats raw entropy as `XXXX-XXXX-XXXX`. */
export function encodeRecoveryCode(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_SIZE; i += 1) {
    chars.push(ALPHABET[(bytes[i] ?? 0) % ALPHABET.length]!);
  }
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g += 1) {
    groups.push(chars.slice(g * RECOVERY_CODE_GROUP_SIZE, (g + 1) * RECOVERY_CODE_GROUP_SIZE).join(""));
  }
  return groups.join("-");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < count && guard < count * 20) {
    const bytes = new Uint8Array(RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_SIZE);
    crypto.getRandomValues(bytes);
    out.add(encodeRecoveryCode(bytes));
    guard += 1;
  }
  return [...out];
}

/** Users retype codes with spaces, lowercase, or missing dashes — all accepted. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedRecoveryCode(input: string): boolean {
  const n = normalizeRecoveryCode(input);
  if (n.length !== RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_SIZE) return false;
  return [...n].every((c) => ALPHABET.includes(c));
}

/** Salted, user-bound digest. Same value on server and in tests. */
export async function hashRecoveryCode(userId: string, code: string, salt: string): Promise<string> {
  const material = `${salt}:${userId}:${normalizeRecoveryCode(code)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
