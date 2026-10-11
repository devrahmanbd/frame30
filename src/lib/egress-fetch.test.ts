import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EgressError, fetchWithEgressGuard } from "./egress-fetch";
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

/** Spy that records URLs but delegates to the real fetch (local servers). */
function spyOnRealFetch(seen: string[]) {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    seen.push(String(input));
    return realFetch(input as string, init);
  });
}

describe("fetchWithEgressGuard", () => {
  it("refuses a metadata URL before connect: zero fetch issued", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
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
    vi.stubGlobal("fetch", fetchSpy);
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
    spyOnRealFetch(seen);
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${a.port}/first`, {
        timeoutMs: 5_000,
        guard: allowLocal,
        lookup: publicLookup,
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
    vi.stubGlobal("fetch", fetchSpy);
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://hooks.example.com/ok", {
        timeoutMs: 500,
        guard: (u) => isAllowedHooksUrl(u),
        lookup: publicLookup,
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
    vi.stubGlobal("fetch", fetchSpy);
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const err = await egressCodeOf(
      fetchWithEgressGuard("https://rebind.example.com/hook", {
        timeoutMs: 500,
        guard: allowAll,
        lookup: async () => [ip],
      }),
    );
    expect(err.code).toBe("egress_dns_blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a public resolved IP through to the (stubbed) fetch", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const out = await fetchWithEgressGuard("https://rebind.example.com/hook", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: publicLookup,
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
    spyOnRealFetch(seen);
    const out = await fetchWithEgressGuard(
      `http://127.0.0.1:${srv.port}/start`,
      { timeoutMs: 5_000, guard: allowLocal, lookup: publicLookup },
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
    spyOnRealFetch(seen);
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${srv.port}/loop`, {
        timeoutMs: 5_000,
        maxRedirects: 1,
        guard: allowLocal,
        lookup: publicLookup,
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
    spyOnRealFetch(seen);
    const started = Date.now();
    const err = await egressCodeOf(
      fetchWithEgressGuard(`http://127.0.0.1:${srv.port}/hang`, {
        timeoutMs: 150,
        guard: allowLocal,
        lookup: publicLookup,
      }),
    );
    expect(err.code).toBe("egress_timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(seen).toHaveLength(1);
  });

  it("times out while DNS hangs (deadline covers resolution, no fetch issued)", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
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
      }),
    );
    expect(err.code).toBe("egress_timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a 3xx without Location as terminal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 304 })),
    );
    const allowAll = (raw: string) => ({
      ok: true as const,
      url: new URL(raw),
    });
    const out = await fetchWithEgressGuard("https://rebind.example.com/x", {
      timeoutMs: 500,
      guard: allowAll,
      lookup: publicLookup,
    });
    expect(out.response.status).toBe(304);
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
    vi.stubGlobal("fetch", fetchSpy);
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
    const out = await runHook([plugin] as never, "order.created", { id: "o1" });
    expect(out[0]?.status).toBe("skipped");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("queued hook path parks a metadata redirect instead of retrying it", async () => {
    const { deliverQueuedHook, resetBreakers } =
      await import("./plugin-hooks.server");
    resetBreakers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://169.254.169.254/latest/meta-data" },
          }),
      ),
    );
    const res = await deliverQueuedHook({
      pluginId: "egress-park",
      installId: "install-egress",
      hook: "order.created",
      body: "{}",
      hooksUrl: "https://apps.example.com/hooks",
    });
    expect(res).toEqual({ ok: false, reason: "egress_redirect_blocked" });
  });

  it("queued hook path enforces the 800ms deadline (throws, so the queue retries)", async () => {
    const { deliverQueuedHook, resetBreakers } =
      await import("./plugin-hooks.server");
    resetBreakers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    const started = Date.now();
    await expect(
      deliverQueuedHook({
        pluginId: "egress-timeout",
        installId: "install-egress",
        hook: "order.created",
        body: "{}",
        hooksUrl: "https://apps.example.com/hooks",
      }),
    ).rejects.toMatchObject({ code: "egress_timeout" });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(10_000);
  });
});
