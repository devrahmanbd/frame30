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
 * so it is safe; `.local` (mDNS) is link-local. `.framique.test` (dot-anchored
 * + exact apex) is our dev domain — Rule 5: generic `.test` is NOT trusted
 * because `evilframique.test` ends with `.test` yet is attacker-controlled.
 */
const LOCAL_SUFFIXES = [".localhost", ".local", ".framique.test"] as const;

/** Exact local hostnames without a dot-suffix (single-label + apex). */
const LOCAL_EXACT = new Set(["framique.test"]);

/** True only for genuine local-development hostnames. Never a substring test. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (LOCAL_EXACT.has(host)) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Ephemeral preview-deployment hosts (Rule 5/28).
 *
 * The edge previously trusted any `preview.*` / `id-preview--*` hostname
 * (startsWith), so `preview.evil.com` relaxed HSTS/framing + bypassed the
 * unmapped-host gate. Now platform-suffix-anchored: the prefix must be
 * present AND the full host must end with a platform suffix.
 */
const PREVIEW_PREFIXES = ["preview.", "id-preview--"] as const;

const PREVIEW_PLATFORM_SUFFIXES = [
  ".framique.store",
  ".framique.com",
  ".framique.app",
  ".framique.dev",
  ".qubickle.com",
  ".localhost",
  ".vercel.app",
] as const;

const PREVIEW_PLATFORM_EXACT = new Set([
  "framique.qubickle.com",
  "edge.framique.store",
]);

export function isPreviewDeployHost(hostname: string): boolean {
  const host =
    hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
  if (!host) return false;
  const hasPrefix = PREVIEW_PREFIXES.some((p) => host.startsWith(p));
  if (!hasPrefix) return false;
  if (PREVIEW_PLATFORM_EXACT.has(host)) return true;
  return PREVIEW_PLATFORM_SUFFIXES.some((s) => host.endsWith(s));
}
