/**
 * Edge wrong-cert identity helpers (replica-skew detection without edge SSH).
 *
 * Diagnosed 2026-09-25/28: custom domains intermittently serve the shared
 * default cert (`bitcart.ghostmaster.shop`, curl 60) because ACME/cert
 * storage is per edge replica. The app cannot read edge disks, but it CAN
 * read the certificate the serving path presents over TLS — so every check
 * here answers one question: does the presented identity cover the hostname
 * we asked for?
 *
 * Pure functions, no I/O: safe to call from the sweep, the provision worker,
 * and the deploy gate alike. Name matching mirrors Node's
 * `tls.checkServerIdentity` hostname semantics (SAN-first, CN fallback only
 * when no DNS SAN exists, `*` matches exactly one leftmost label).
 */

import { X509Certificate } from "node:crypto";

export type PresentedIdentity = {
  subject?: { CN?: unknown };
  sans: string[];
};

function matchDnsPattern(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase();
  const h = host.toLowerCase();
  if (!p || !h) return false;
  if (!p.includes("*")) return p === h;
  // Wildcard: exactly one leftmost label (RFC 6125 §6.4.3).
  if (!p.startsWith("*.")) return false;
  const suffix = p.slice(2);
  if (!suffix || suffix.includes("*")) return false;
  if (h === suffix) return false;
  if (!h.endsWith(`.${suffix}`)) return false;
  return h.slice(0, h.length - suffix.length - 1).includes(".") === false;
}

/**
 * Does the presented cert identity cover `hostname`? `sans` are bare DNS
 * names (no `DNS:` prefix); CN is consulted only when no SAN exists.
 */
export function servedIdentityMatches(
  hostname: string,
  identity: PresentedIdentity,
): boolean {
  const host = hostname.toLowerCase();
  if (!host) return false;
  if (identity.sans.length > 0) {
    return identity.sans.some((san) => matchDnsPattern(san, host));
  }
  const cn =
    typeof identity.subject?.CN === "string" ? identity.subject.CN : "";
  return matchDnsPattern(cn, host);
}

/** Split an X509 `subjectAltName` string (`DNS:a, DNS:*.b`) into bare names. */
export function parseSubjectAltName(alt: unknown): string[] {
  if (typeof alt !== "string") return [];
  return alt
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("DNS:"))
    .map((part) => part.slice(4).trim())
    .filter(Boolean);
}

/** Summarise a presented identity for logs/metrics (first SAN, else CN). */
export function summariseIdentity(identity: PresentedIdentity): string {
  const san = identity.sans.find(Boolean);
  if (san) return san;
  const cn =
    typeof identity.subject?.CN === "string" ? identity.subject.CN : "";
  return cn || "unknown";
}

/**
 * Does a local PEM bundle cover `hostname`? Zero-network check for the
 * provision worker: the issue script only asserts the bundle parses and is
 * unexpired (`openssl checkend`), so a mis-issued bundle for the wrong name
 * would otherwise flip the domain `active` on PEM dates alone. Returns false
 * (never throws) on unparseable input.
 */
export function certCoversHost(pem: string, hostname: string): boolean {
  try {
    const cert = new X509Certificate(pem);
    return servedIdentityMatches(hostname, {
      subject: { CN: parseDistinguishedName(cert.subject).CN },
      sans: parseSubjectAltName(cert.subjectAltName),
    });
  } catch {
    return false;
  }
}

/** Extract `CN` from an X509 DN string (`CN=shop.example.com\nO=…`). */
function parseDistinguishedName(dn: unknown): { CN?: string } {
  if (typeof dn !== "string") return {};
  for (const line of dn.split("\n")) {
    const m = line.trim().match(/^CN\s*=\s*(.+)$/i);
    if (m) return { CN: m[1]!.trim() };
  }
  return {};
}
