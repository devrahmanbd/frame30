import { describe, expect, it, vi, beforeEach } from "vitest";
import { requestCertificate } from "./domains.server";

const updates: Record<string, unknown>[] = [];
const events: Record<string, unknown>[] = [];

const row = {
  id: "d1",
  merchant_id: "m1",
  hostname: "shop.example.com",
  status: "dns_verified",
  verification_token: "tok",
  check_attempts: 0,
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "domain_events") {
        return {
          insert: vi.fn(
            async (r: unknown) => (
              events.push(r as Record<string, unknown>),
              { error: null }
            ),
          ),
        };
      }
      return {
        update: vi.fn(
          (patch: unknown) => (
            updates.push(patch as Record<string, unknown>),
            { eq: vi.fn(async () => ({ error: null })) }
          ),
        ),
        eq: () => ({
          update: vi.fn(
            async (patch: unknown) => (
              updates.push(patch as Record<string, unknown>),
              { error: null }
            ),
          ),
          maybeSingle: vi.fn(async () => ({ data: { ...row }, error: null })),
          single: vi.fn(async () => ({ data: { ...row }, error: null })),
          select: vi.fn(async () => ({ data: { ...row }, error: null })),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn(async () => ({
                data: { ...row },
                error: null,
              })),
            }),
            maybeSingle: vi.fn(async () => ({ data: { ...row }, error: null })),
          }),
        }),
      };
    },
  },
}));

function fakeDb() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { ...row }, error: null }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("requestCertificate without edge hook", () => {
  beforeEach(() => {
    updates.length = 0;
    events.length = 0;
    delete process.env["DOMAIN_EDGE_HOOK_URL"];
    vi.restoreAllMocks();
  });

  it("does NOT park in issuing_cert when no order can be placed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const view = await requestCertificate(fakeDb(), "m1", "d1", null);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Must stay verifiable/servable-tracked, never strand in issuing_cert.
    expect(view.status).not.toBe("issuing_cert");
    expect(view.status).toBe("dns_verified");
    expect(
      updates.some((u) => (u as { status?: string }).status === "issuing_cert"),
    ).toBe(false);
  });
});
