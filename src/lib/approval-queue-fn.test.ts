/**
 * Threat-defense approval-queue server fn (wiring pins).
 *
 * `approvalQueueFn` exposes the read-only `pendingApprovals`
 * (`approval-queue.server.ts`, never modified here) through TanStack Start
 * so the desks can badge flagged content. Read-only means read gates only —
 * no `*.update` permission may appear in this module.
 *
 * NOTE: no test in this repo invokes a TanStack Start server fn directly
 * (the `approve-fn.test.ts` precedent) — the wiring half is pinned by
 * source assertions, the behaviour half drives `pendingApprovals` on
 * `fakeDb` (`approval-queue.test.ts`).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

const { approvalQueueFn } = await import("./approval-queue.functions");

const FUNCTIONS_SRC = "/opt/frame28/src/lib/approval-queue.functions.ts";

describe("approvalQueueFn wiring", () => {
  it("is exported from the approval-queue functions module", () => {
    expect(typeof approvalQueueFn).toBe("function");
  });

  it("is a GET fn behind read gates delegating to pendingApprovals", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).toContain("approvalQueueFn");
    expect(src).toContain('method: "GET"');
    expect(src).toContain('requirePermission("themes.read")');
    expect(src).toContain('requirePermission("plugins.read")');
    expect(src).toContain("pendingApprovals");
  });

  it("carries no write permission", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).not.toContain("themes.update");
    expect(src).not.toContain("plugins.update");
    expect(src).not.toContain("themeApproveFn");
    expect(src).not.toContain("pluginApproveFn");
  });
});
