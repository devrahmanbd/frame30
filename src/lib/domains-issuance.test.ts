import { describe, expect, it, vi, beforeEach } from "vitest";
import { reconcileIssuance, refreshActiveExpiry } from "./domains.server";

type TlsMode = "valid" | "refused" | "untrusted";
let tlsMode: TlsMode = "valid";

vi.mock("node:tls", () => ({
  connect: vi.fn(() => {
    const handlers: Record<string, ((...a: never[]) => void)[]> = {};
    const sock = {
      on: (ev: string, fn: (...a: never[]) => void) => {
        (handlers[ev] ??= []).push(fn);
        return sock;
      },
      destroy: vi.fn(),
      getPeerCertificate: () =>
        tlsMode === "valid"
          ? {
              valid_from: "Sep  1 00:00:00 2026 GMT",
              valid_to: "Dec  1 00:00:00 2026 GMT",
              subject: { CN: "shop.example.com" },
            }
          : {},
    };
    queueMicrotask(() => {
      if (tlsMode === "valid")
        for (const fn of handlers["secureConnect"] ?? []) fn();
      else
        for (const fn of handlers["error"] ?? [])
          fn(
            new Error(
              tlsMode === "refused"
                ? "ECONNREFUSED"
                : "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
            ) as never,
          );
    });
    return sock;
  }),
}));

const rows = new Map<string, Record<string, unknown>>();
const events: Record<string, unknown>[] = [];

function matches(row: Record<string, unknown>, filters: [string, unknown][]) {
  return filters.every(([k, v]) => row[k] === v);
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "domain_events" || table === "notifications") {
        return {
          insert: vi.fn(
            async (r: unknown) => (
              events.push(r as Record<string, unknown>),
              { error: null }
            ),
          ),
        };
      }
      const state = {
        filters: [] as [string, unknown][],
        patch: null as Record<string, unknown> | null,
      };
      const api = {
        select: vi.fn(() => api),
        eq: vi.fn((k: string, v: unknown) => (state.filters.push([k, v]), api)),
        maybeSingle: vi.fn(async () => ({
          data:
            [...rows.values()].find((r) => matches(r, state.filters)) ?? null,
          error: null,
        })),
        update: vi.fn(
          (p: unknown) => (
            (state.patch = p as Record<string, unknown>),
            {
              eq: vi.fn(async (k: string, v: unknown) => {
                for (const r of rows.values())
                  if (r[k] === v) Object.assign(r, state.patch);
                return { error: null };
              }),
            }
          ),
        ),
      };
      return api;
    },
  },
}));

function seed(status: string) {
  rows.clear();
  events.length = 0;
  rows.set("d1", {
    id: "d1",
    merchant_id: "m1",
    hostname: "shop.example.com",
    status,
    verification_token: "tok",
    check_attempts: 0,
  });
}

describe("reconcileIssuance (edge cert observation)", () => {
  beforeEach(() => {
    tlsMode = "valid";
  });

  it("flips dns_verified to active when a valid public cert is served", async () => {
    seed("dns_verified");
    const flipped = await reconcileIssuance("shop.example.com");
    expect(flipped).toBe(true);
    expect(rows.get("d1")?.["status"]).toBe("active");
    expect(rows.get("d1")?.["cert_status"]).toBe("issued");
    expect(rows.get("d1")?.["cert_expires_at"]).toContain("2026-12-01");
    expect(events.some((e) => e["reason"] === "cert.issued")).toBe(true);
  });

  it("leaves the domain alone when nothing answers on 443", async () => {
    seed("dns_verified");
    tlsMode = "refused";
    const flipped = await reconcileIssuance("shop.example.com");
    expect(flipped).toBe(false);
    expect(rows.get("d1")?.["status"]).toBe("dns_verified");
    expect(events.some((e) => e["reason"] === "cert.issued")).toBe(false);
  });

  it("rejects untrusted certs (staging/self-signed can never flip)", async () => {
    seed("issuing_cert");
    tlsMode = "untrusted";
    const flipped = await reconcileIssuance("shop.example.com");
    expect(flipped).toBe(false);
    expect(rows.get("d1")?.["status"]).toBe("issuing_cert");
  });

  it("never flips unverified rows even with a valid cert", async () => {
    seed("pending_dns");
    const flipped = await reconcileIssuance("shop.example.com");
    expect(flipped).toBe(false);
    expect(rows.get("d1")?.["status"]).toBe("pending_dns");
  });
});

describe("verifyDomain full loop (manual Check now + sweep share one path)", () => {
  beforeEach(() => {
    tlsMode = "valid";
  });

  function liveDb() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ...rows.get("d1") },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never;
  }

  function dohOk() {
    return vi.fn(async (url: unknown) => {
      const u = String(url);
      const answers = u.includes("type=TXT")
        ? [{ type: 16, data: "framique-verification=tok" }]
        : u.includes("type=CNAME")
          ? [{ type: 5, data: "framique.qubickle.com" }]
          : [];
      return { ok: true, json: async () => ({ Answer: answers, Status: 0 }) };
    });
  }

  it("pending_dns + good DNS + live edge cert ends active in one pass", async () => {
    seed("pending_dns");
    delete process.env["DOMAIN_EDGE_HOOK_URL"];
    vi.stubGlobal("fetch", dohOk());
    const { verifyDomain } = await import("./domains.server");
    const view = await verifyDomain(liveDb(), "m1", "sweep-test", "d1", {
      manual: false,
      actor: null,
    });
    vi.unstubAllGlobals();
    expect(view.status).toBe("active");
    expect(rows.get("d1")?.["cert_status"]).toBe("issued");
    expect(events.some((e) => e["reason"] === "cert.issued")).toBe(true);
  });

  it("pending_dns + good DNS + no edge cert yet stays dns_verified awaiting edge", async () => {
    seed("pending_dns");
    delete process.env["DOMAIN_EDGE_HOOK_URL"];
    tlsMode = "refused";
    vi.stubGlobal("fetch", dohOk());
    const { verifyDomain } = await import("./domains.server");
    const view = await verifyDomain(liveDb(), "m1", "sweep-test", "d1", {
      manual: false,
      actor: null,
    });
    vi.unstubAllGlobals();
    expect(view.status).toBe("dns_verified");
    expect(rows.get("d1")?.["cert_error"]).toBe("cert.awaiting_edge");
  });
});

describe("refreshActiveExpiry (stale cert_expires_at on live rows)", () => {
  beforeEach(() => {
    tlsMode = "valid";
  });

  function seedActive(expiresAt: string) {
    seed("active");
    Object.assign(rows.get("d1")!, {
      cert_status: "issued",
      cert_expires_at: expiresAt,
      cert_error: null,
    });
  }

  it("refreshes a stale expiry from the served cert, staying active", async () => {
    seedActive("2026-10-01T00:00:00.000Z");
    const refreshed = await refreshActiveExpiry("shop.example.com");
    expect(refreshed).toBe(true);
    expect(rows.get("d1")?.["status"]).toBe("active");
    expect(rows.get("d1")?.["cert_status"]).toBe("issued");
    expect(rows.get("d1")?.["cert_expires_at"]).toContain("2026-12-01");
  });

  it("leaves a current expiry alone (no write, no event noise)", async () => {
    seedActive("2026-12-01T00:00:00.000Z");
    const refreshed = await refreshActiveExpiry("shop.example.com");
    expect(refreshed).toBe(false);
    expect(events.length).toBe(0);
  });

  it("leaves the row alone when 443 is unreachable", async () => {
    seedActive("2026-10-01T00:00:00.000Z");
    tlsMode = "refused";
    const refreshed = await refreshActiveExpiry("shop.example.com");
    expect(refreshed).toBe(false);
    expect(rows.get("d1")?.["cert_expires_at"]).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("never touches non-active rows", async () => {
    seed("issuing_cert");
    const refreshed = await refreshActiveExpiry("shop.example.com");
    expect(refreshed).toBe(false);
    expect(rows.get("d1")?.["status"]).toBe("issuing_cert");
  });
});
