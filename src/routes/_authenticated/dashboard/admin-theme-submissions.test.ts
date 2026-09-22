/**
 * Staff review queue for theme submissions (staff-only, `themes.publish`).
 *
 * The pending list renders one row per submission (package key / version /
 * merchant / date) with Approve + Reject actions wired to
 * `decideThemeSubmissionFn`. No DOM env exists in this repo, so the queue
 * is covered at the data/logic level with `chain()`-style Supabase mocks
 * (precedent: `src/lib/marketplace-bridge.test.ts`).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Fails while the staff screen module is missing (RED) — the screen file
// exports the pure row projector its table renders.
import { toReviewRows } from "./admin-theme-submissions";
import { listPendingThemeSubmissions } from "@/lib/theme-submissions.server";

const MERCHANT = "00000000-0000-4000-a000-000000000001";

/** Route `db.from(table)` to a per-table query-chain stub. */
function chain(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

function pendingRow(id: string, pkg: Record<string, unknown>) {
  return {
    id,
    merchant_id: MERCHANT,
    package: pkg,
    status: "pending",
    submitted_at: "2026-09-22T10:00:00.000Z",
  };
}

describe("pending theme-submission queue", () => {
  it("lists pending submissions with package key/version/merchant/date", async () => {
    // Drive the mock per table: only theme_submissions is read.
    const rows = [
      pendingRow("11111111-1111-4111-8111-111111111111", {
        key: "demo-studio",
        version: "1.0.0",
      }),
      pendingRow("22222222-2222-4222-8222-222222222222", {
        key: "heritage-loom",
        version: "2.3.1",
      }),
    ];
    const queued = {
      from: vi.fn((table: string) => {
        expect(table).toBe("theme_submissions");
        return chain(rows);
      }),
    } as never;

    const list = await listPendingThemeSubmissions(queued);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      merchantId: MERCHANT,
      packageKey: "demo-studio",
      packageVersion: "1.0.0",
      submittedAt: "2026-09-22T10:00:00.000Z",
      status: "pending",
    });
    expect(list[1]).toMatchObject({
      packageKey: "heritage-loom",
      packageVersion: "2.3.1",
    });
  });

  it("renders one review row per pending submission with approve/reject targets", async () => {
    const rows = [
      pendingRow("11111111-1111-4111-8111-111111111111", {
        key: "demo-studio",
        version: "1.0.0",
      }),
    ];
    const db = { from: vi.fn(() => chain(rows)) } as never;
    const list = await listPendingThemeSubmissions(db);
    const rendered = toReviewRows(list);
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      packageKey: "demo-studio",
      packageVersion: "1.0.0",
      merchantId: MERCHANT,
      submittedAt: "2026-09-22T10:00:00.000Z",
    });
    // Every rendered row keeps its submission id so the Approve/Reject
    // buttons can target decideThemeSubmissionFn({ id, approve, note }).
    for (const row of rendered) {
      expect(typeof row.id).toBe("string");
      expect(row.id).toHaveLength(36);
    }
  });

  it("renders an empty queue without rows", () => {
    expect(toReviewRows([])).toEqual([]);
  });

  it("gates the review queue loader and decision like builderPublishFn (themes.publish)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/theme-submissions.functions.ts"),
      "utf-8",
    );
    const guards = src.match(/requirePermission\("themes\.publish"\)/g) ?? [];
    // pendingThemeSubmissionsFn (GET queue) + decideThemeSubmissionFn (decision).
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("pendingThemeSubmissionsFn");
  });
});
