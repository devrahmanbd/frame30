import { describe, expect, it, vi } from "vitest";
import { validateThemePackage } from "./theme-package";
import {
  decideThemeSubmission,
  submitThemePackage,
} from "./theme-submissions.server";

const good = {
  key: "demo-studio",
  nameEn: "Demo Studio",
  nameBn: "ডেমো স্টুডিও",
  summaryEn: "Minimal demo theme.",
  summaryBn: "সাধারণ ডেমো থিম।",
  category: "fashion",
  version: "1.0.0",
  api: "^3.0.0",
  sortOrder: 10,
  tokens: {},
  templates: {
    index: { header: [], main: [], footer: [] },
  },
};

const MERCHANT = "00000000-0000-4000-a000-000000000001";

/** Route `db.from(table)` to per-table query-chain stubs. */
function mockDb(routes: Record<string, () => unknown>) {
  const from = vi.fn((table: string) => {
    const build = routes[table];
    if (!build) throw new Error(`unexpected table: ${table}`);
    return build();
  });
  return { from };
}

function allowlistChain(approved: boolean) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: approved ? { merchant_id: MERCHANT } : null,
            error: null,
          }),
      }),
    }),
  };
}

describe("submission acceptance", () => {
  it("rejects invalid packages before any DB write", async () => {
    expect(validateThemePackage({ key: "x" }).ok).toBe(true);
    const badApi = { ...good, api: "^4.0.0" };
    expect(validateThemePackage(badApi).ok).toBe(false);
    const db = mockDb({ theme_developers: () => allowlistChain(true) });
    await expect(submitThemePackage(db as never, MERCHANT, badApi)).rejects.toThrow(
      /unsupported api range|Package invalid/,
    );
    expect(db.from).not.toHaveBeenCalledWith("theme_submissions");
  });

  it("rejects submissions from non-approved developers", async () => {
    const db = mockDb({ theme_developers: () => allowlistChain(false) });
    await expect(submitThemePackage(db as never, MERCHANT, good)).rejects.toThrow(
      "not an approved developer",
    );
    expect(db.from).not.toHaveBeenCalledWith("theme_submissions");
  });

  it("inserts a pending row for a valid package", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = mockDb({
      theme_developers: () => allowlistChain(true),
      theme_submissions: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              inserted.push(row);
              return Promise.resolve({
                data: { id: "sub-1" },
                error: null,
              });
            },
          }),
        }),
      }),
    });
    const out = await submitThemePackage(db as never, MERCHANT, good);
    expect(out).toEqual({ id: "sub-1" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      merchant_id: MERCHANT,
      status: "pending",
    });
    expect(inserted[0]!["package"]).toEqual(good);
  });
});

describe("submission review", () => {
  function reviewDb(row: Record<string, unknown>) {
    const updated: Record<string, unknown>[] = [];
    const upserted: Record<string, unknown>[] = [];
    const db = mockDb({
      theme_submissions: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            updated.push(patch);
            return Promise.resolve({ error: null });
          },
        }),
      }),
      theme_registry: () => ({
        upsert: (entry: Record<string, unknown>) => {
          upserted.push(entry);
          return Promise.resolve({ error: null });
        },
      }),
    });
    return { db, updated, upserted };
  }

  it("approve publishes the package into the registry", async () => {
    const row = {
      id: "sub-1",
      merchant_id: MERCHANT,
      package: good,
      status: "pending",
      reviewer_note: null,
    };
    const { db, updated, upserted } = reviewDb(row);
    const out = await decideThemeSubmission(db as never, "sub-1", true, "looks good");
    expect(out).toEqual({ status: "approved" });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      status: "approved",
      reviewer_note: "looks good",
    });
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({
      key: "demo-studio",
      name_en: "Demo Studio",
      active: true,
    });
    expect(upserted[0]!["preset"]).toMatchObject({ tokens: {}, templates: {} });
  });

  it("reject records the reviewer note without publishing", async () => {
    const row = {
      id: "sub-2",
      merchant_id: MERCHANT,
      package: good,
      status: "pending",
      reviewer_note: null,
    };
    const { db, updated, upserted } = reviewDb(row);
    const out = await decideThemeSubmission(db as never, "sub-2", false, "needs bn copy");
    expect(out).toEqual({ status: "rejected" });
    expect(updated[0]).toMatchObject({
      status: "rejected",
      reviewer_note: "needs bn copy",
    });
    expect(upserted).toHaveLength(0);
    expect(db.from).not.toHaveBeenCalledWith("theme_registry");
  });
});
