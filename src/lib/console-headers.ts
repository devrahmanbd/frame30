/**
 * §5 — console document headers.
 *
 * The three consoles (`/admin`, `/dashboard`, `/root`) are never framed and
 * never indexed. The storefront hardening is unchanged: this only adds
 * `frame-ancestors 'none'`, `X-Robots-Tag: noindex` and a private cache policy
 * on console documents, which is why it is a pure function of the pathname.
 */

export const CONSOLE_PREFIXES = ["/admin", "/dashboard", "/root", "/onboarding", "/auth"] as const;

export function isConsolePath(pathname: string): boolean {
  return CONSOLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Headers applied to a console HTML document, in addition to the base set. */
export function consoleSecurityHeaders(): Record<string, string> {
  return {
    "content-security-policy": "frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow",
    "cache-control": "private, no-store",
  };
}
