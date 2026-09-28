/**
 * Edge hook v1 — local ACME provisioning without polling or callbacks.
 *
 * Why this exists: the TLS edge (OpenResty :80 + haproxy :443) already
 * serves HTTP-01 challenges (`/.well-known/acme-challenge/` → certbot
 * webroot with an autossl fallback), but nothing ever *ordered* a cert —
 * `DOMAIN_EDGE_HOOK_URL` has no receiver anywhere, so verified domains
 * parked forever. This module closes the loop in-process:
 *
 *   DNS verified → order via certbot (webroot) → PEM into haproxy certs →
 *   reload → observe → `active` (all through the audited `applyCertResult`
 *   path; failures land in `cert_error` with the 1h recheck, never silent).
 *
 * Scale contract (no cron needed on the hot path):
 * - per-host single-flight + 10-minute cooldown: concurrent visitors,
 *   retries and double-clicks coalesce into one order per host per window;
 * - hostname is validated before it ever touches a shell (fixed argv shape,
 *   `execFile`, no string commands — injection is a type error, not a test);
 * - account key + private keys never leave the server (certbot + PEM files
 *   are root-only; the app only passes a hostname and reads back dates).
 */
import { execFile } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { certCoversHost } from "./edge-cert-identity.server";
import { incr, log } from "./observability.server";

/** Pinned system path. Never configurable per-request — see module doc. */
export const CERT_SCRIPT = "/usr/local/bin/framique-cert-issue.sh";

/** PEM drop directory (haproxy `crt` dir). Mirrors the script default. */
export const EDGE_CERT_DIR = "/etc/haproxy/certs";

/** One order per host per window — concurrent triggers coalesce. */
export const PROVISION_COOLDOWN_MS = 10 * 60_000;

/** Let's Encrypt duplicate-cert window guard (5 identical/week). */
const HOST_RE = /^(?=[a-z0-9.-]{4,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function isProvisionableHost(hostname: string): boolean {
  if (!HOST_RE.test(hostname)) return false;
  // Must contain at least one letter (rejects bare IPv4) and a real TLD.
  if (!/[a-z]/.test(hostname)) return false;
  const tld = hostname.slice(hostname.lastIndexOf(".") + 1);
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;
  if (hostname.endsWith(".localhost") || hostname === "localhost") return false;
  return true;
}

const FIXED_SCRIPT_ARGS = ["live", "staging"] as const;

/**
 * Fixed-shape script invocation. The hostname travels as a positional arg
 * to the pinned script (which re-validates); nothing is ever interpolated
 * into a shell string — `execFile`, no shell. Throws on hostile input.
 */
export function buildIssueCommand(
  hostname: string,
  opts: { staging?: boolean; email?: string } = {},
): string[] {
  if (!isProvisionableHost(hostname)) {
    throw new Error(`edge.provision_rejected: ${hostname}`);
  }
  if (opts.email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email)) {
      throw new Error("edge.provision_rejected: bad acme email");
    }
  }
  const script = process.env["EDGE_CERT_SCRIPT"] ?? CERT_SCRIPT;
  return [script, hostname.toLowerCase(), opts.staging ? "staging" : "live"];
}

export type ProvisionVerdict = "go" | "inflight";

/** Single-flight gate. Callers hold the map; entries expire after cooldown. */
export function shouldProvisionNow(
  hostname: string,
  inflight: Map<string, number>,
  clock: () => number = Date.now,
): ProvisionVerdict {
  const started = inflight.get(hostname);
  if (started !== undefined && clock() - started < PROVISION_COOLDOWN_MS) {
    return "inflight";
  }
  return "go";
}

export type ProvisionResult =
  { ok: true; expiresAt: string } | { ok: false; error: string };

export type ProvisionedPem =
  { ok: true; expiresAt: string } | { ok: false; error: string };

/**
 * Inspect a provisioned PEM bundle before it can flip a domain `active`.
 *
 * The issue script only asserts the bundle parses and is unexpired
 * (`openssl checkend`), so a valid-but-misnamed bundle (wrong SAN — the
 * local analogue of replica skew) would otherwise mark the wrong hostname
 * live on dates alone. This check is pure-local (parse + compare, no
 * network, no ACME order) so it can never trip LE rate limits.
 */
export function inspectProvisionedPem(
  pem: string,
  hostname: string,
): ProvisionedPem {
  let expires: number;
  try {
    expires = new Date(new X509Certificate(pem).validTo).getTime();
  } catch {
    return { ok: false, error: "edge.pem_unreadable" };
  }
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return { ok: false, error: "edge.bad_pem_dates" };
  }
  if (!certCoversHost(pem, hostname.toLowerCase())) {
    log("warn", "domain.pem_wrong_host", { domain: hostname.toLowerCase() });
    incr("framique_domain_provision_total", { outcome: "wrong_host" });
    return { ok: false, error: "edge.pem_wrong_host" };
  }
  return { ok: true, expiresAt: new Date(expires).toISOString() };
}

function execFileAsync(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { code?: string };
          reject(
            new Error(
              `edge.script_failed: ${e.code ?? "error"} ${String(stderr ?? "").slice(0, 200)}`,
            ),
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/**
 * Run one provisioning order end-to-end: certbot (webroot HTTP-01 through
 * the live :80 challenge path) → PEM assembled + haproxy reloaded by the
 * script → read back the served cert dates from the written PEM.
 * Throws on any failure; never writes partial state (the state machine
 * moves only via `applyCertResult` in the caller).
 */
export async function runProvisionOrder(
  hostname: string,
  opts: { staging?: boolean; timeoutMs?: number } = {},
): Promise<ProvisionResult> {
  const host = hostname.toLowerCase();
  let invoke: string[];
  try {
    invoke = buildIssueCommand(host, opts);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "edge.rejected",
    };
  }
  try {
    // invoke = [script, host, mode]: fixed shape, execFile without a shell.
    const [script, ...args] = invoke;
    await execFileAsync(script!, args, opts.timeoutMs ?? 120_000);
  } catch (err) {
    log("warn", "domain.provision_failed", { domain: host });
    incr("framique_domain_provision_total", { outcome: "error" });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "edge.script_failed",
    };
  }
  try {
    const pem = await readFile(`${EDGE_CERT_DIR}/${host}.pem`, "utf8");
    const inspected = inspectProvisionedPem(pem, host);
    if (!inspected.ok) {
      return { ok: false, error: inspected.error };
    }
    incr("framique_domain_provision_total", { outcome: "ok" });
    return { ok: true, expiresAt: inspected.expiresAt };
  } catch {
    return { ok: false, error: "edge.pem_unreadable" };
  }
}
