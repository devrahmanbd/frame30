import { describe, expect, it, vi, beforeEach } from "vitest";
import { renameDomain } from "./domains.server";

const patches: Record<string, unknown>[] = [];

const row = {
  id: "d1",
  merchant_id: "m1",
  hostname: "old.example.com",
  status: "active",
  verification_token: "tok",
  check_attempts: 0,
  cert_status: "issued",
  cert_expires_at: "2026-12-18T00:00:00.000Z",
  cert_issued_at: "2026-09-19T00:00:00.000Z",
  activated_at: "2026-09-19T00:00:00.000Z",
  verified_at: "2026-09-19T00:00:00.000Z",
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "domain_events") {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      const api = {
        select: vi.fn(() => api),
        eq: vi.fn(() => api),
        maybeSingle: vi.fn(async () => ({ data: { ...row }, error: null })),
        single: vi.fn(async () => ({ data: { ...row }, error: null })),
        update: vi.fn(
          (patch: unknown) => (
            patches.push(patch as Record<string, unknown>),
            { eq: vi.fn(async () => ({ error: null })) }
          ),
        ),
      };
      return api;
    },
  },
}));

function fakeDb() {
  const api: Record<string, (...a: never[]) => unknown> = {};
  api["from"] = () => api;
  api["select"] = () => api;
  api["eq"] = () => api;
  api["order"] = () => api;
  api["limit"] = () => api;
  api["maybeSingle"] = (async () => ({
    data: { ...row },
    error: null,
  })) as never;
  api["then"] = ((resolve: (v: unknown) => void) =>
    resolve({ data: [{ ...row }], error: null })) as never;
  return api as never;
}

describe("renameDomain", () => {
  beforeEach(() => {
    patches.length = 0;
  });

  it("clears certificate state tied to the old hostname", async () => {
    await renameDomain(fakeDb(), "m1", "u1", "d1", "new.example.com");
    const patch = patches.find((p) => "hostname" in p);
    expect(patch).toMatchObject({ hostname: "new.example.com" });
    // A cert issued for old.example.com must never display as valid.
    expect(patch).toMatchObject({
      cert_status: "pending",
      cert_expires_at: null,
      cert_issued_at: null,
      cert_error: null,
      activated_at: null,
      verified_at: null,
      check_attempts: 0,
    });
  });
});
