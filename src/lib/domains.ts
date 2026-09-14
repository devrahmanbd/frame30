/**
 * Custom-domain domain logic (pure, browser-safe, unit tested).
 *
 * Everything here is deterministic so the state machine, hostname rules and
 * DNS instructions can be tested without a database or network: the server
 * module owns I/O, this module owns the rules.
 */

/** Hostnames a merchant may never claim — platform surfaces and reserved names. */
export const RESERVED_SUFFIXES = [
  "framique.app",
  "framique.dev",
  "supabase.co",
  "localhost",
] as const;

const RESERVED_LABELS = new Set([
  "admin",
  "api",
  "assets",
  "cdn",
  "dashboard",
  "internal",
  "mail",
  "platform",
  "status",
]);

/** Second-level registry suffixes where the registrable name has three labels. */
const MULTI_PART_TLDS = new Set([
  "com.bd",
  "net.bd",
  "org.bd",
  "gov.bd",
  "edu.bd",
  "ac.bd",
  "co.uk",
  "org.uk",
  "com.au",
  "co.in",
]);

export type DomainStatus =
  | "pending_dns"
  | "verifying"
  | "dns_verified"
  | "issuing_cert"
  | "active"
  | "failed"
  | "disabled";

export type CertStatus = "none" | "pending" | "issued" | "renewing" | "error";

export class DomainInputError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DomainInputError";
  }
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Accepts what merchants actually paste — `https://Shop.Example.com/`, a
 * trailing dot, stray whitespace — and returns the canonical hostname, or
 * throws a stable error code the UI can translate.
 */
export function normalizeHostname(input: string): string {
  let value = (input ?? "").trim().toLowerCase();
  if (!value) throw new DomainInputError("domain.empty");
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";
  value = value.split("@").pop() ?? "";
  value = value.replace(/\.$/, "");
  if (value.includes(":")) value = value.split(":")[0] ?? "";
  if (!value) throw new DomainInputError("domain.empty");
  if (value.length > 253) throw new DomainInputError("domain.too_long");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) throw new DomainInputError("domain.ip_not_allowed");

  // Unicode domains are stored as punycode so DNS lookups and certificates match.
  let ascii = value;
  if (/[^\u0000-\u007f]/.test(value)) {
    try {
      ascii = new URL(`https://${value}`).hostname;
    } catch {
      throw new DomainInputError("domain.invalid");
    }
  }

  if (RESERVED_SUFFIXES.some((s) => ascii === s || ascii.endsWith(`.${s}`))) {
    throw new DomainInputError("domain.reserved");
  }
  const labels = ascii.split(".");
  if (labels.length < 2) throw new DomainInputError("domain.needs_tld");
  for (const label of labels) {
    if (!LABEL_RE.test(label)) throw new DomainInputError("domain.invalid");
  }
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) throw new DomainInputError("domain.invalid");
  if (labels.length > 2 && RESERVED_LABELS.has(labels[0] ?? "")) {
    throw new DomainInputError("domain.reserved_label");
  }
  return ascii;
}

/** True when the hostname is the registrable apex (no sub-domain in front). */
export function isApex(hostname: string): boolean {
  const labels = hostname.split(".");
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_TLDS.has(lastTwo) ? labels.length === 3 : labels.length === 2;
}

export const CHALLENGE_PREFIX = "_framique-challenge";

export function challengeHost(hostname: string): string {
  return `${CHALLENGE_PREFIX}.${hostname}`;
}

export type DnsRecord = {
  type: "TXT" | "CNAME" | "A" | "ALIAS";
  name: string;
  value: string;
  required: boolean;
  note: "ownership" | "routing" | "routing_alt";
};

/**
 * The exact records to paste into a registrar. Apex names cannot hold a CNAME,
 * so we hand out A records with an ALIAS/ANAME alternative for registrars that
 * support flattening.
 */
export function dnsInstructions(
  hostname: string,
  token: string,
  target: { cname: string; ips: string[] },
): DnsRecord[] {
  const records: DnsRecord[] = [
    {
      type: "TXT",
      name: challengeHost(hostname),
      value: `framique-verification=${token}`,
      required: true,
      note: "ownership",
    },
  ];
  if (isApex(hostname)) {
    for (const ip of target.ips) {
      records.push({ type: "A", name: hostname, value: ip, required: true, note: "routing" });
    }
    records.push({
      type: "ALIAS",
      name: hostname,
      value: target.cname,
      required: false,
      note: "routing_alt",
    });
  } else {
    records.push({
      type: "CNAME",
      name: hostname,
      value: target.cname,
      required: true,
      note: "routing",
    });
  }
  return records;
}

/** Allowed state-machine edges. Anything else is a bug, not a user error. */
export const DOMAIN_TRANSITIONS: Record<DomainStatus, DomainStatus[]> = {
  pending_dns: ["verifying", "disabled", "failed"],
  verifying: ["dns_verified", "pending_dns", "failed", "disabled"],
  dns_verified: ["issuing_cert", "verifying", "failed", "disabled"],
  issuing_cert: ["active", "failed", "dns_verified", "disabled"],
  active: ["verifying", "failed", "disabled"],
  failed: ["verifying", "pending_dns", "disabled"],
  disabled: ["pending_dns"],
};

export function canTransition(from: DomainStatus, to: DomainStatus): boolean {
  if (from === to) return true;
  return (DOMAIN_TRANSITIONS[from] ?? []).includes(to);
}

/** Exponential backoff between automatic DNS polls: 1m → 2m → 4m … capped at 6h. */
export function nextCheckDelaySeconds(attempts: number): number {
  const base = 60;
  const capped = Math.min(Math.max(attempts, 0), 9);
  return Math.min(base * 2 ** capped, 21600);
}

/** A domain stops being polled automatically once it has been failing for days. */
export const MAX_AUTO_ATTEMPTS = 40;

export type CertHealth = {
  state: "none" | "ok" | "renew_soon" | "expiring" | "expired";
  daysLeft: number | null;
};

export function certHealth(expiresAt: string | null, now = Date.now()): CertHealth {
  if (!expiresAt) return { state: "none", daysLeft: null };
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return { state: "none", daysLeft: null };
  const daysLeft = Math.floor(ms / 86_400_000);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= 7) return { state: "expiring", daysLeft };
  if (daysLeft <= 30) return { state: "renew_soon", daysLeft };
  return { state: "ok", daysLeft };
}

export type DomainTone = "neutral" | "info" | "success" | "warning" | "danger";

export function statusTone(status: DomainStatus): DomainTone {
  switch (status) {
    case "active":
      return "success";
    case "failed":
      return "danger";
    case "disabled":
      return "neutral";
    case "dns_verified":
    case "issuing_cert":
      return "info";
    default:
      return "warning";
  }
}

/** Ordered checklist rendered next to each domain so progress is legible. */
export const DOMAIN_STAGES: { key: DomainStatus; reached: DomainStatus[] }[] = [
  { key: "pending_dns", reached: ["pending_dns", "verifying", "dns_verified", "issuing_cert", "active"] },
  { key: "verifying", reached: ["verifying", "dns_verified", "issuing_cert", "active"] },
  { key: "dns_verified", reached: ["dns_verified", "issuing_cert", "active"] },
  { key: "issuing_cert", reached: ["issuing_cert", "active"] },
  { key: "active", reached: ["active"] },
];

/** Compares observed DNS answers with what we asked for. */
export function evaluateDns(input: {
  hostname: string;
  token: string;
  txt: string[];
  cname: string[];
  a: string[];
  target: { cname: string; ips: string[] };
}): { ownership: boolean; routing: boolean; reason: string | null } {
  const want = `framique-verification=${input.token}`;
  const ownership = input.txt.some((t) => t.replace(/^"|"$/g, "").trim() === want);
  const wantHost = input.target.cname.replace(/\.$/, "").toLowerCase();
  const routing =
    input.cname.some((c) => c.replace(/\.$/, "").toLowerCase() === wantHost) ||
    input.a.some((ip) => input.target.ips.includes(ip));
  if (!ownership) return { ownership, routing, reason: "domain.txt_missing" };
  if (!routing) return { ownership, routing, reason: "domain.routing_missing" };
  return { ownership, routing, reason: null };
}
