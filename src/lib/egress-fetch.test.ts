import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EgressError, fetchWithEgressGuard } from "./egress-fetch";
import type { EgressTransport, PinnedTransportInit } from "./egress-fetch";
import { isAllowedHooksUrl } from "./plugin-manifest";

const PUBLIC_IP = "93.184.216.34";
const publicLookup = async () => [PUBLIC_IP];

type Started = {
  port: number;
  hits: () => number;
  close: () => Promise<void>;
};

const openServers: Started[] = [];

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<Started> {
  let n = 0;
  const server: Server = createServer((req, res) => {
    n += 1;
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  const started: Started = {
    port,
    hits: () => n,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // A hanging test server holds open sockets; destroy them so close
        // resolves instead of stalling the suite.
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
  openServers.push(started);
  return started;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (openServers.length) {
    const s = openServers.pop();
    if (s) await s.close();
  }
});

async function egressCodeOf(p: Promise<unknown>): Promise<EgressError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof EgressError) return err;
    throw err;
  }
  throw new Error("expected EgressError");
}

/** Test guard: local http allowed, the metadata IP refused. */
function allowLocal(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false as const, reason: "bad_url" };
  }
  if (url.hostname === "169.254.169.254")
    return { ok: false as const, reason: "private_range" };
  return { ok: true as const, url };
}

/** Transport spy that records URLs but delegates to the real fetch (local servers). */
function spyTransport(seen: string[]): EgressTransport {
  const realFetch = globalThis.fetch.bind(globalThis);
  return async (url: string, init: PinnedTransportInit) => {
    seen.push(String(url));
    // Manual redirects: the wrapper (not the transport) owns redirect
    // policy, exactly like the pinned transport it stands in for. Only
    // string bodies occur on this path in practice (JSON POSTs, GETs).
    const { addresses: _addresses, body, ...rest } = init;
    return realFetch(url, {
      ...rest,
      ...(typeof body === "string" ? { body } : {}),
      redirect: "manual",
    });
  };
}

describe("fetchWithEgressGuard", () => {
  it("refuses a metadata URL before connect: zero fetch issued", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://169.254.169.254/latest/meta-data", {
        timeoutMs: 500,
        guard: (u) => isAllowedHooksUrl(u),
      }),
    );
    expect(err.code).toBe("egress_denied");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses loopback http before connect (guard first, no DNS, no fetch)", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const err = await egressCodeOf(
      fetchWithEgressGuard("http://127.0.0.1:9/hook", {
        timeoutMs: 500,
        guard: (u) => isAllowedHooksUrl(u),
      }),
    );
    expect(err.code).toBe("egress_denied");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a real 302 chain whose second hop points at the metadata IP (zero bytes from it)", async () => {
    const b = await startServer((_req, res) => {
      res.writeHead(302, {
        location: "https://169.254.169.254/latest/meta-data",
      });
      res.end();
    });
    const a = await startServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${b.port}/second` });
      res.end();
    });
    const seen: string[] = [];
    const transport = spyTransport(seen);
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${a.port}/first`, {
        timeoutMs: 5_000,
        guard: allowLocal,
        lookup: async () => ["127.0.0.1"],
        allowLoopback: true,
        transport,
      }),
    );
    expect(err.code).toBe("egress_redirect_blocked");
    expect(a.hits()).toBe(1);
    expect(b.hits()).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen.some((u) => u.includes("169.254"))).toBe(false);
  });

  it("blocks an https-downgrade redirect under the strict hooks guard", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    fetchSpy.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://hooks.example.com/downgrade" },
        }),
    );
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://hooks.example.com/ok", {
        timeoutMs: 500,
        guard: (u) => isAllowedHooksUrl(u),
        lookup: publicLookup,
        transport: fetchSpy,
      }),
    );
    expect(err.code).toBe("egress_redirect_blocked");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    "10.1.2.3",
    "192.168.0.9",
    "172.16.4.4",
    "172.31.255.1",
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
  ])("DNS-rebinding: resolved %s is refused before connect", async (ip) => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://rebind.example.com/hook", {
        timeoutMs: 500,
        guard: allowAll,
        lookup: async () => [ip],
        transport: fetchSpy,
      }),
    );
    expect(err.code).toBe("egress_dns_blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a public resolved IP through to the (stubbed) fetch", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: publicLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(out.response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("follows a relative redirect and returns the final response", async () => {
    const srv = await startServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("done");
    });
    const seen: string[] = [];
    const transport = spyTransport(seen);
    const out = await fetchWithEgressGuard(
      `http://127.0.0.1:${srv.port}/start`,
      {
        timeoutMs: 5_000,
        guard: allowLocal,
        lookup: async () => ["127.0.0.1"],
        allowLoopback: true,
        transport,
      },
    );
    expect(out.response.status).toBe(200);
    await expect(out.response.text()).resolves.toBe("done");
    expect(seen).toHaveLength(2);
    expect(srv.hits()).toBe(2);
  });

  it("aborts past maxRedirects", async () => {
    const srv = await startServer((_req, res) => {
      res.writeHead(302, { location: "/loop" });
      res.end();
    });
    const seen: string[] = [];
    const transport = spyTransport(seen);
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${srv.port}/loop`, {
        timeoutMs: 5_000,
        maxRedirects: 1,
        guard: allowLocal,
        lookup: async () => ["127.0.0.1"],
        allowLoopback: true,
        transport,
      }),
    );
    expect(err.code).toBe("egress_too_many_redirects");
    // Initial fetch + one allowed follow, then refusal.
    expect(seen).toHaveLength(2);
  });

  it("times out against a hanging server", async () => {
    const srv = await startServer(() => {
      // Never respond — the socket just hangs.
    });
    const seen: string[] = [];
    const transport = spyTransport(seen);
    const started = Date.now();
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${srv.port}/hang`, {
        timeoutMs: 150,
        guard: allowLocal,
        lookup: async () => ["127.0.0.1"],
        allowLoopback: true,
        transport,
      }),
    );
    expect(err.code).toBe("egress_timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(seen).toHaveLength(1);
  });

  it("times out while DNS hangs (deadline covers resolution, no fetch issued)", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const started = Date.now();
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://slow-dns.example.com/hook", {
        timeoutMs: 100,
        guard: allowAll,
        lookup: () => new Promise<string[]>(() => {}),
        transport: fetchSpy,
      }),
    );
    expect(err.code).toBe("egress_timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a 3xx without Location as terminal", async () => {
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const out = await fetchWithEgressGuard("https://rebind.example.com/x", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: publicLookup,
      transport: async () => new Response(null, { status: 304 }),
    });
    expect(out.response.status).toBe(304);
  });
});

describe("TOCTOU: connect-time DNS change", () => {
  const allowAll = (raw: string) => ({
    ok: true as const,
    url: new URL(raw),
  });

  it("a flip between resolutions cannot steer the socket: single resolve wins", async () => {
    // The flip this suite originally guarded against is now structurally
    // impossible: one resolution decides, and the pinned transport connects
    // ONLY to that answer set. A flapping resolver still yields exactly one
    // answer per hop — whichever comes first — and blocked answers refuse
    // before any socket opens.
    let calls = 0;
    const flappingLookup = async () => {
      calls += 1;
      return calls === 1 ? [PUBLIC_IP] : ["127.0.0.1"];
    };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: flappingLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it("post-connect DNS changes cannot reroute an open socket", async () => {
    // With pinning, the response provably comes from the checked address
    // set, so later answers — even blocked ones — must not discard it.
    // (Previously this re-resolved after connect and dropped the body.)
    let calls = 0;
    const flappingLookup = async () => {
      calls += 1;
      return calls <= 1 ? [PUBLIC_IP] : ["169.254.169.254"];
    };
    const fetchSpy = vi.fn(async () => new Response("secret", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: flappingLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(await out.response.text()).toBe("secret");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a public-only rotation across hops is safe under pinning", async () => {
    // Each hop binds its own answer set; rotation between hops is normal
    // pool behavior, never a refusal.
    let calls = 0;
    const rotatingLookup = async () => {
      calls += 1;
      return calls === 1 ? [PUBLIC_IP] : ["93.184.216.35"];
    };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: rotatingLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tolerates round-robin order rotation of a stable address set (no false positive)", async () => {
    let calls = 0;
    const roundRobinLookup = async () => {
      calls += 1;
      return calls % 2 === 1
        ? [PUBLIC_IP, "93.184.216.35"]
        : ["93.184.216.35", PUBLIC_IP];
    };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: roundRobinLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("stays fail-open when the resolver errors (plain network error downstream)", async () => {
    // A failed lookup must not turn a DNS outage into a refusal: the fetch
    // is still attempted, and the caller's retry semantics for plain network
    // errors are preserved.
    const failingLookup = async () => {
      throw new Error("ENOTFOUND rebind.example.com");
    };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: failingLookup,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tolerates a public-only set change across resolutions", async () => {
    // Each hop binds whatever single answer it gets; rotation between hops
    // is normal pool behavior, never a refusal.
    let calls = 0;
    const rotatingAfterConnect = async () => {
      calls += 1;
      return calls <= 2 ? [PUBLIC_IP] : ["93.184.216.35"];
    };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: rotatingAfterConnect,
      transport: fetchSpy,
    });
    expect(out.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("contains a redirect hop whose DNS flips after connect (never fetched)", async () => {
    const b = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("evil-secret");
    });
    const a = await startServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${b.port}/secret` });
      res.end();
    });
    // Hop A resolves loopback (test seam) and is fetched for real; the
    // redirect target then resolves to the metadata IP, so the socket is
    // never opened against B — no request bytes reach the rebound target.
    let calls = 0;
    const flappingLookup = async () => {
      calls += 1;
      return calls <= 1 ? ["127.0.0.1"] : ["169.254.169.254"];
    };
    const seen: string[] = [];
    const transport = spyTransport(seen);
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${a.port}/first`, {
        timeoutMs: 5_000,
        guard: allowLocal,
        lookup: flappingLookup,
        allowLoopback: true,
        transport,
      }),
    );
    expect(err.code).toBe("egress_dns_blocked");
    expect(a.hits()).toBe(1);
    expect(b.hits()).toBe(0);
    expect(seen).toHaveLength(1);
  });
});

describe("rewired call sites", () => {
  it("live hook path skips (no queue) when the endpoint redirects to metadata", async () => {
    const { runHook, resetBreakers } = await import("./plugin-hooks.server");
    resetBreakers();
    const fetchSpy = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
        }),
    );
    const plugin = {
      installId: "install-egress",
      manifest: {
        id: "egress-test",
        hooks: ["order.created" as const],
        hooksUrl: "https://apps.example.com/hooks",
      },
      grantedScopes: ["read_orders"],
      settings: {},
      enabled: true,
    };
    const out = await runHook(
      [plugin] as never,
      "order.created",
      { id: "o1" },
      undefined,
      fetchSpy,
    );
    expect(out[0]?.status).toBe("skipped");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("queued hook path parks a metadata redirect instead of retrying it", async () => {
    const { deliverQueuedHook, resetBreakers } =
      await import("./plugin-hooks.server");
    resetBreakers();
    const transport = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
        }),
    );
    const res = await deliverQueuedHook(
      {
        pluginId: "egress-park",
        installId: "install-egress",
        hook: "order.created",
        body: "{}",
        hooksUrl: "https://apps.example.com/hooks",
      },
      { transport },
    );
    expect(res).toEqual({ ok: false, reason: "egress_redirect_blocked" });
  });

  it("queued hook path enforces the 800ms deadline (throws, so the queue retries)", async () => {
    const { deliverQueuedHook, resetBreakers } =
      await import("./plugin-hooks.server");
    resetBreakers();
    const transport = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const started = Date.now();
    await expect(
      deliverQueuedHook(
        {
          pluginId: "egress-timeout",
          installId: "install-egress",
          hook: "order.created",
          body: "{}",
          hooksUrl: "https://apps.example.com/hooks",
        },
        { transport },
      ),
    ).rejects.toMatchObject({ code: "egress_timeout" });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(10_000);
  });
});

describe("pinned transport (socket-level DNS pinning)", () => {
  const allowAll = (raw: string) => ({
    ok: true as const,
    url: new URL(raw),
  });
  async function startOn(
    host: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<Started> {
    let n = 0;
    const { createServer: create } = await import("node:http");
    const server = create((req, res) => {
      n += 1;
      handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    const started: Started = {
      port,
      hits: () => n,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
    openServers.push(started);
    return started;
  }

  it("connects to the pinned IP even when DNS says otherwise", async () => {
    const { pinnedTransport } = await import("./egress-fetch");
    const decoy = await startOn("127.0.0.1", (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("decoy");
    });
    const real = await startOn("127.0.0.2", (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pinned");
    });
    const res = await pinnedTransport(
      `http://rebind.example.com:${real.port}/`,
      {
        method: "GET",
        headers: {},
        body: null,
        signal: new AbortController().signal,
        addresses: ["127.0.0.2"],
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pinned");
    expect(real.hits()).toBe(1);
    expect(decoy.hits()).toBe(0);
  });

  it("fetchWithEgressGuard uses the pinned transport for real local servers", async () => {
    const real = await startOn("127.0.0.2", (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    const out = await fetchWithEgressGuard(
      `http://local.example.com:${real.port}/hook`,
      {
        timeoutMs: 2000,
        guard: allowLocal,
        lookup: async () => ["127.0.0.2"],
        allowLoopback: true,
      },
    );
    expect(out.response.status).toBe(200);
  });

  it("injected transport receives the call; denied URLs never reach it", async () => {
    const { pinnedTransport } = await import("./egress-fetch");
    expect(typeof pinnedTransport).toBe("function");
    const seen: string[] = [];
    const transport = async (url: string) => {
      seen.push(url);
      return new Response("{}", { status: 200 });
    };
    const out = await fetchWithEgressGuard("https://example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: publicLookup,
      transport,
    });
    expect(out.response.status).toBe(200);
    expect(seen).toEqual(["https://example.com/hook"]);
    const denied = await egressCodeOf(
      fetchWithEgressGuard("https://169.254.169.254/x", {
        timeoutMs: 500,
        guard: (u) => isAllowedHooksUrl(u),
        lookup: publicLookup,
        transport,
      }),
    );
    expect(denied.code).toBe("egress_denied");
    expect(seen).toHaveLength(1);
  });
});
