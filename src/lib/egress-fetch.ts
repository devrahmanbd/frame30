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
 *
 * TOCTOU elimination via socket pinning: the global `fetch` API accepts
 * no lookup/dispatcher hook, so this module ships its own minimal transport
 * (`pinnedTransport`, `node:http(s)` only — no new dependencies) that opens
 * the socket against the validated address set and nothing else. Each hop
 * resolves once with a block-check; the pinned connect then makes a
 * mid-flight DNS flip unable to steer the request — the bytes go to a
 * checked IP or the request fails. A `transport` option lets tests inject
 * canned transports; production call sites must never pass one. An
 * `allowLoopback` option exists for tests running real local servers only
 * and must never be set outside tests.
 *
 * TLS note: the original hostname URL is passed through unchanged and
 * `servername` is set explicitly to the hostname, so SNI and certificate
 * verification target the hostname exactly as with `fetch`.
 * `rejectUnauthorized: false` must NEVER appear on this path.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

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
  /**
   * Transport seam: defaults to the pinned `node:http(s)` transport below.
   * Tests inject canned transports; production call sites must NEVER pass
   * a stub here (the pinned default is the security boundary).
   */
  transport?: EgressTransport;
  /**
   * Test-only seam: allow loopback answers (127/8, ::1) through the DNS
   * IP block so tests can run real local servers. NEVER set outside
   * tests — production call sites resolving to loopback must keep
   * failing closed.
   */
  allowLoopback?: boolean;
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
export function isBlockedEgressIp(ip: string, allowLoopback = false): boolean {
  let addr = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — judge the embedded IPv4.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1] as string;
  if (addr.includes(":")) {
    if (addr === "::") return true;
    const parts = addr.split(":");
    const allZero = parts.every((p) => p === "" || /^0+$/.test(p));
    // ::1 (and all-zero forms normalizing to ::) are loopback: refused
    // unless the test-only allowLoopback seam is set. Every other v6
    // block below stays refused either way.
    if (addr === "::1" || allZero) return !allowLoopback;
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
    (a === 127 && !allowLoopback) ||
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
  allowLoopback = false,
): Promise<string[] | undefined> {
  let host = "";
  try {
    host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return undefined; // Unparseable — the guard already refused it before we got here.
  }
  if (!host) return undefined;
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
    return undefined;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  for (const addr of addresses) {
    if (isBlockedEgressIp(addr, allowLoopback))
      throw new EgressError("egress_dns_blocked", "private_ip", rawUrl);
  }
  return addresses;
}

export type PinnedTransportInit = {
  method: string;
  headers: HeadersInit | undefined;
  /** Only string bodies occur on guarded paths (JSON POSTs); GETs use null. */
  body?: string | null;
  signal: AbortSignal;
  /** Validated destination addresses — the socket connects to one of these. */
  addresses: string[];
};

/**
 * Transport with a pinned destination: `(url, init) => Response`.
 * The default implementation below opens the socket against the validated
 * addresses only; tests inject canned transports.
 */
export type EgressTransport = (
  url: string,
  init: PinnedTransportInit,
) => Promise<Response>;

function normalizeTransportHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const push = (k: string, v: string) => {
    out[k.toLowerCase()] = v;
  };
  if (headers instanceof Headers) {
    headers.forEach((v, k) => push(k, v));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) push(k, v);
  } else {
    for (const [k, v] of Object.entries(headers)) push(k, v);
  }
  return out;
}

/**
 * Socket-level DNS pinning over `node:http(s)` — the true fix for the
 * resolve→connect TOCTOU window that `fetch` cannot close (it accepts no
 * lookup/dispatcher hook).
 *
 * The socket connects ONLY to an address from the validated `addresses`
 * set via a custom `lookup`, so a mid-flight DNS flip cannot steer the
 * connection: whatever the resolver says now, the bytes go to a checked
 * IP or the request fails. TLS is untouched — `servername` is set
 * explicitly to the original hostname (never defaulted, never disabled)
 * so SNI and certificate verification target the hostname exactly as
 * with `fetch`; `rejectUnauthorized` stays at its default (true).
 * Redirects are never followed here (the caller loop owns them).
 */
export async function pinnedTransport(
  url: string,
  init: PinnedTransportInit,
): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new TypeError("pinnedTransport: http(s) URLs only");
  }
  const addresses = init.addresses;
  if (addresses.length === 0) {
    // Fail open exactly like the pre-pinning code: resolution produced
    // nothing to pin (outage, not a verdict), so attempt a normal fetch
    // and let downstream retry semantics handle the network error. This
    // path carries the pre-existing residual (unpinned single resolution
    // inside fetch) — it only triggers when our own resolutions failed.
    return globalThis.fetch(url, {
      method: init.method,
      headers: normalizeTransportHeaders(init.headers),
      body:
        init.body === null || init.body === undefined
          ? null
          : typeof init.body === "string"
            ? init.body
            : Buffer.from(init.body),
      redirect: "manual",
      signal: init.signal,
    });
  }
  let bodyBytes: Uint8Array | null = null;
  if (init.body !== null && init.body !== undefined) {
    bodyBytes = new TextEncoder().encode(init.body);
  }
  const outHeaders = normalizeTransportHeaders(init.headers);
  if (bodyBytes) outHeaders["content-length"] = String(bodyBytes.length);
  const lib = u.protocol === "https:" ? https : http;
  const firstPinned = init.addresses[0] as string;
  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: init.method,
        headers: outHeaders,
        signal: init.signal,
        // Pin the socket: ignore whatever DNS says now, connect to a
        // validated address. servername stays the original hostname so
        // TLS verification is byte-identical to a normal fetch.
        // `family` is explicit and the `{all: true}` form is answered:
        // without both, Node 22's Happy-Eyeballs path re-invokes lookup
        // expecting an array and fails the connect ("Invalid IP address").
        family: firstPinned.includes(":") ? 6 : 4,
        lookup: (
          _hostname: string,
          lookupOptions: LookupOptions,
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number,
          ) => void,
        ) => {
          const pinned = init.addresses[0] as string | undefined;
          if (!pinned) {
            callback(
              Object.assign(
                new Error("pinnedTransport: empty pinned address set"),
                { code: "ENOTFOUND" },
              ) as NodeJS.ErrnoException,
              "",
              4,
            );
            return;
          }
          const family = pinned.includes(":") ? 6 : 4;
          const wantAll =
            typeof lookupOptions === "object" &&
            lookupOptions !== null &&
            (lookupOptions as { all?: unknown }).all === true;
          if (wantAll) callback(null, [{ address: pinned, family }]);
          else callback(null, pinned, family);
        },
        servername: u.hostname,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) {
            for (const item of v) headers.append(k, item);
          } else {
            headers.append(k, v);
          }
        }
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream, {
            status: res.statusCode ?? 0,
            headers,
          }),
        );
      },
    );
    req.on("error", reject);
    if (bodyBytes) req.write(bodyBytes);
    req.end();
  });
}

/**
 * Guarded fetch. Validates the initial URL with `guard`, resolves once
 * (blocked answers refuse here), and opens the socket ONLY against the
 * validated answer set via the pinned transport — a mid-flight DNS flip
 * cannot steer the connection. Every `Location` target is validated the
 * same way before following, up to `maxRedirects`. The `timeoutMs`
 * deadline covers the whole chain via one AbortController.
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
  const allowLoopback = opts.allowLoopback ?? false;
  const transport = opts.transport ?? pinnedTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let current = String(rawUrl);
    let method = opts.method ?? "GET";
    let body: string | null = typeof opts.body === "string" ? opts.body : null;
    let redirects = 0;
    for (;;) {
      const verdict = opts.guard(current);
      if (!verdict.ok)
        throw new EgressError(
          "egress_denied",
          verdict.reason ?? "guard_refused",
          current,
        );
      // Pinned destination: resolve once, block-check, and hand the
      // answer set to the transport, which connects ONLY to it — a
      // mid-flight DNS flip cannot steer the socket (true pinning, not
      // check-then-hope). A failing lookup fails open (undefined → the
      // transport attempts a normal fetch whose network error preserves
      // pre-existing retry semantics).
      const pinned =
        (await assertDnsAllowed(
          current,
          lookup,
          controller.signal,
          allowLoopback,
        )) ?? [];
      // The deadline may have fired while guarding/resolving (or a caller
      // passed an already-expired budget): never issue a request on an
      // aborted signal — stubs and some runtimes only reject on the abort
      // *event* and would hang forever on an already-aborted signal.
      if (controller.signal.aborted)
        throw new EgressError("egress_timeout", "timeout", current);
      let res: Response;
      try {
        res = await transport(current, {
          method,
          headers: opts.headers,
          body,
          signal: controller.signal,
          addresses: pinned,
        });
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError")
          throw new EgressError("egress_timeout", "timeout", current);
        throw err;
      }
      // No post-connect re-resolution: the socket was opened against the
      // checked answer set above, so the response provably comes from a
      // validated IP regardless of what DNS says now. (A post-connect
      // check could only false-positive on legitimate pool rotations.)
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
      await assertDnsAllowed(
        next.toString(),
        lookup,
        controller.signal,
        allowLoopback,
      );
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
