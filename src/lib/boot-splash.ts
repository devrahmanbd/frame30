/**
 * Which paths need the static boot splash (client-gated, `ssr: false`).
 * Shared by the server gate (`boot-splash.server.ts`) and the client
 * fallback so both sides agree for the same URL (no hydration mismatch).
 */
const GATED_PREFIXES = ["/dashboard", "/root", "/onboarding", "/oauth"];

export function isClientGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
