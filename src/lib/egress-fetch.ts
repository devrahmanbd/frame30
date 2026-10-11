/**
 * Egress-guarded fetch — SSRF defense for every server-side outbound request
 * to a caller-influenced URL (plugin hooks, merchant webhooks, image origins).
 *
 * `fetch` follows redirects silently (up to 20 hops, any target), so a stored
 * https URL that later starts 302-ing to the metadata endpoint would exfiltrate
 * behind a guard that only checked the initial URL. This wrapper fetches with
 * `redirect: "manual"` and re-runs the caller's guard against EVERY `Location`
 * target (relative resolved against the current URL) before following it.
 *
 * DNS-rebinding layer: before each connect the hostname is resolved via
 * `node:dns/promises` and every returned address is judged against the
 * private/loopback/link-local ranges. This catches the case the hostname guard
 * cannot — a public-looking name currently resolving to 10/8, 169.254/16,
 * ::1, fe80::/10, … — on the initial URL and on each redirect hop. A lookup
 * FAILURE fails open (the connect then fails with a plain network error, as
 * before this guard existed); a lookup that RETURNS a blocked address fails
 * closed. An injectable `lookup` keeps this unit-testable without a network.
 */

import { lookup as dnsLookup } from "node:dns/promises";

export type EgressCode =
  | "egress_denied"
  | "egress_redirect_blocked"
  | "egress_timeout"
  | "egress_too_many_redirects"
  | "egress_dns_blocked";

export class EgressError extends Error {
  readonly code: EgressCode;
  readonly reason: string;
  readonly url: string;

  constructor(code: EgressCode, reason: string, url: string) {
    super(`${code}: ${reason} (${url})`);
    this.name = "EgressError";
    this.code = code;
    this.reason = reason;
    this.url = url;
  }
}

/**
 * Any hostname guard with a boolean verdict fits: `isAllowedHooksUrl`,
 * `validateEndpointUrl`, or `(raw) => isAllowedSource(raw, hosts)`. The
 * wrapper reads only `ok`/`reason`; the normalized URL (if any) is ignored.
 */
export type EgressGuard = (rawUrl: string) => {
  ok: boolean;
  reason?: string;
  url?: unknown;
};

export type EgressFetchOptions = {
  /** Whole-chain deadline (initial fetch + every redirect hop), ms. */
  timeoutMs: number;
  /** Redirect follows allowed before `egress_too_many_redirects`. */
  maxRedirects?: number;
  guard: EgressGuard;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  /** Test seam: defaults to `node:dns/promises` lookup. */
  lookup?: (host: string) => Promise<string[]>;
};

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function defaultLookup(host: string): Promise<string[]> {
  const all = await dnsLookup(host, { all: true });
  return all.map((r) => r.address);
}

/**
 * Judges one IP address. Mirrors the literal-IP/private-range refusals in
 * `isAllowedHooksUrl` (`src/lib/plugin-manifest.ts:406-496`) — 10/8, 127/8,
 * 172.16/12, 192.168/16, 169.254/16 and 0/8 — plus IPv6 loopback (::1),
 * unspecified (::), link-local (fe80::/10), unique-local (fc00::/7) and
 * IPv4-mapped private addresses. Duplicated (not imported) because no
 * single-IP predicate is exported; the hostname decision stays with the
 * caller's guard, this layer only judges resolved/literal IPs.
 */
export function isBlockedEgressIp(ip: string): boolean {
  let addr = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — judge the embedded IPv4.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1] as string;
  if (addr.includes(":")) {
    if (addr === "::1" || addr === "::") return true;
    const parts = addr.split(":");
    if (parts.every((p) => p === "" || /^0+$/.test(p))) return true;
    const first = parts[0] as string;
    const n = Number.parseInt(first, 16);
    if (!Number.isNaN(n)) {
      if ((n & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
      if ((n & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    }
    return false;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (!m) return false; // Not an IP literal — a hostname, judged by the guard.
  const o = [m[1], m[2], m[3], m[4]].map(Number);
  if (!o.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return false;
  const a = o[0] as number;
  const b = o[1] as number;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

async function assertDnsAllowed(
  rawUrl: string,
  lookup: (host: string) => Promise<string[]>,
  signal: AbortSignal,
): Promise<void> {
  let host = "";
  try {
    host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return; // Unparseable — the guard already refused it before we got here.
  }
  if (!host) return;
  let addresses: string[];
  // The chain deadline covers resolution too: a hanging resolver must not
  // outlive `timeoutMs`. The abort race rejects with a timeout; any other
  // lookup failure fails open (see below).
  let onAbort: (() => void) | undefined;
  try {
    addresses = await Promise.race([
      lookup(host),
      new Promise<never>((_resolve, reject) => {
        if (signal.aborted) {
          reject(new EgressError("egress_timeout", "timeout", rawUrl));
          return;
        }
        onAbort = () =>
          reject(new EgressError("egress_timeout", "timeout", rawUrl));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (err) {
    if (err instanceof EgressError) throw err;
    // Fail open: an unresolvable host fails at connect with a plain network
    // error (retryable downstream), exactly as before this layer existed.
    return;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  for (const addr of addresses) {
    if (isBlockedEgressIp(addr))
      throw new EgressError("egress_dns_blocked", "private_ip", rawUrl);
  }
}

/**
 * Guarded fetch. Validates the initial URL with `guard`, fetches with
 * `redirect: "manual"`, and validates every `Location` target with the same
 * guard (plus a DNS re-resolution) before following, up to `maxRedirects`.
 * The `timeoutMs` deadline covers the whole chain via one AbortController.
 *
 * Returns the terminal response (caller still checks `res.ok`). Throws
 * `EgressError` with a machine `code`, or rethrows the underlying network
 * error untouched so callers keep their existing retry semantics for those.
 */
export async function fetchWithEgressGuard(
  rawUrl: string,
  opts: EgressFetchOptions,
): Promise<{ ok: true; response: Response }> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const lookup = opts.lookup ?? defaultLookup;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let current = String(rawUrl);
    let method = opts.method ?? "GET";
    let body = opts.body ?? null;
    let redirects = 0;
    for (;;) {
      const verdict = opts.guard(current);
      if (!verdict.ok)
        throw new EgressError(
          "egress_denied",
          verdict.reason ?? "guard_refused",
          current,
        );
      await assertDnsAllowed(current, lookup, controller.signal);
      // The deadline may have fired while guarding/resolving (or a caller
      // passed an already-expired budget): never issue a fetch on an
      // aborted signal — stubs and some runtimes only reject on the abort
      // *event* and would hang forever on an already-aborted signal.
      if (controller.signal.aborted)
        throw new EgressError("egress_timeout", "timeout", current);
      let res: Response;
      try {
        res = await globalThis.fetch(current, {
          method,
          headers: opts.headers,
          body,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError")
          throw new EgressError("egress_timeout", "timeout", current);
        throw err;
      }
      if (!REDIRECT_STATUSES.has(res.status))
        return { ok: true, response: res };
      const location = res.headers.get("location");
      // A 3xx without a target is terminal (e.g. 304) — hand it back as-is.
      if (!location) return { ok: true, response: res };
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new EgressError(
          "egress_redirect_blocked",
          "bad_location",
          location,
        );
      }
      if (redirects >= maxRedirects)
        throw new EgressError(
          "egress_too_many_redirects",
          `max_redirects_${maxRedirects}`,
          next.toString(),
        );
      const hop = opts.guard(next.toString());
      if (!hop.ok)
        throw new EgressError(
          "egress_redirect_blocked",
          hop.reason ?? "guard_refused",
          next.toString(),
        );
      await assertDnsAllowed(next.toString(), lookup, controller.signal);
      redirects += 1;
      // Same rewrite `fetch` itself applies on "follow": 303 (except HEAD)
      // and 301/302-from-POST become GET so a POST body is never replayed at
      // a redirected target.
      if (
        (res.status === 303 && method !== "HEAD") ||
        ((res.status === 301 || res.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = null;
      }
      // Release the redirect response's socket before following.
      try {
        await res.body?.cancel();
      } catch {
        // Best effort — a failed cancel must not mask the redirect.
      }
      current = next.toString();
    }
  } finally {
    clearTimeout(timer);
  }
}
