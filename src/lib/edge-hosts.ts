/**
 * Edge host classification (pure, unit tested).
 *
 * Decides which hostnames count as local development so the server entry can
 * relax HTTPS enforcement and CSRF checks for them. Must be exact-match based:
 * a substring test like `hostname.includes("localhost")` treats attacker hosts
 * such as `localhost.evil.com` or `mylocalhost.com` as local (REPORT WF-10).
 */

/** Loopback literals that are always local. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Development-only suffixes. `*.localhost` resolves to loopback per RFC 6761,
 * so it is safe; `.local` (mDNS) and `framique.test` are our dev domains.
 */
const LOCAL_SUFFIXES = [".localhost", ".local", ".test", "framique.test"] as const;

/** True only for genuine local-development hostnames. Never a substring test. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (LOOPBACK_HOSTS.has(host)) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
