import { getRequest } from "@tanstack/react-start/server";

/**
 * Server-side current-merchant resolution (Sept 2026 multi-merchant fix).
 *
 * The dashboard switcher stores the active store client-side. Server loaders
 * previously ignored it (`first membership wins`), which silently served the
 * WRONG tenant's data on every scope() call — and, once a second membership
 * existed, tripped every merchant-blind permission gate (loadActor resolved
 * no member at all). The client mirrors its choice into a cookie; this module
 * reads that hint and verifies it against the caller's real memberships.
 *
 * Security: the cookie is a hint, never trust. Only a merchant_id present in
 * the caller's own membership rows is ever returned, so a forged cookie can
 * at most select among the attacker's own stores — never another tenant.
 */

export const ACTIVE_MERCHANT_COOKIE = "fq.active_merchant_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: pull the hint out of a Cookie header. Tested directly. */
export function parseActiveMerchantCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACTIVE_MERCHANT_COOKIE) {
      const value = rest.join("=").trim();
      return UUID_RE.test(value) ? value : null;
    }
  }
  return null;
}

export type MembershipRow = { merchant_id: string };

/**
 * Pure: hint-if-member, else single membership, else first row (today's
 * legacy behavior for callers that cannot disambiguate). Never invents an id.
 */
export function pickMembership<T extends MembershipRow>(
  rows: T[],
  hintId: string | null,
): T | null {
  if (rows.length === 0) return null;
  if (hintId) {
    const match = rows.find((r) => r.merchant_id === hintId);
    if (match) return match;
  }
  return rows[0]!;
}

/** Request-scoped hint; null outside a request (tests, scripts) or absent. */
export function requestMerchantHint(): string | null {
  try {
    const req = getRequest();
    return parseActiveMerchantCookie(req?.headers.get("cookie"));
  } catch {
    return null;
  }
}
