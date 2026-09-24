import { describe, expect, it, vi, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionAndApply } from "./domains.server";

let PEM = "";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: vi.fn(
      (
        _file: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "issued", ""),
    ),
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (...a: unknown[]) => {
      if (String(a[0]).endsWith(".pem")) return PEM;
      return (actual.readFile as (...x: unknown[]) => unknown)(...a);
    }),
  };
});

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

function fakeDb() {
  return {} as never;
}

describe("provisionAndApply (local ACME order)", () => {
  beforeAll(() => {
    const out = join(tmpdir(), `wa-test-${Date.now()}.pem`);
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout /dev/null -out "${out}" -days 2 -nodes -subj "/CN=shop.example.com"`,
    );
    PEM = readFileSync(out, "utf8");
    expect(PEM).toContain("BEGIN CERTIFICATE");
  });

  it("flips issuing_cert to active through the audited path", async () => {
    rows.clear();
    events.length = 0;
    rows.set("d1", {
      id: "d1",
      merchant_id: "m1",
      hostname: "shop.example.com",
      status: "issuing_cert",
      check_attempts: 0,
    });
    await provisionAndApply(fakeDb(), "m1", "d1", "shop.example.com", null);
    expect(rows.get("d1")?.["status"]).toBe("active");
    expect(rows.get("d1")?.["cert_status"]).toBe("issued");
    expect(rows.get("d1")?.["cert_expires_at"]).toContain("2026");
    expect(events.some((e) => e["reason"] === "cert.issued")).toBe(true);
  });

  it("records failure without throwing when the order fails", async () => {
    // NOTE: distinct hostname — provisionInflight is module-scoped and the
    // first test stamped shop.example.com (single-flight is the point).
    const { execFile } = await import("node:child_process");
    (
      vi.mocked(execFile) as unknown as {
        mockImplementationOnce(
          fn: (
            file: string,
            args: string[],
            opts: unknown,
            cb: (e: Error | null) => void,
          ) => void,
        ): void;
      }
    ).mockImplementationOnce((_f, _a, _o, cb) => cb(new Error("boom")));
    rows.clear();
    events.length = 0;
    rows.set("d2", {
      id: "d2",
      merchant_id: "m1",
      hostname: "other.example.com",
      status: "issuing_cert",
      check_attempts: 0,
    });
    await provisionAndApply(fakeDb(), "m1", "d2", "other.example.com", null);
    expect(rows.get("d2")?.["status"]).toBe("issuing_cert");
    expect(rows.get("d2")?.["cert_error"]).toContain("edge.script_failed");
    expect(events.some((e) => e["reason"] === "cert.provision_failed")).toBe(
      true,
    );
  });
});
