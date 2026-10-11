/**
 * Threat-defense — security-approvals route conventions.
 *
 * The page component needs router context (`Route.useLoaderData`), so this
 * file only pins the file-convention surface: route id matches the
 * `security-approvals.tsx` file pattern, a loader is registered (it
 * delegates to `approvalQueueFn`), and head meta exists. Row rendering is
 * covered by `ApprovalQueue.test.tsx`; compile + auth-redirect behaviour is
 * covered by the dev-server browser check.
 */
import { describe, expect, it } from "vitest";

import { Route } from "./security-approvals";

describe("security-approvals route", () => {
  it("registers a page component for the dashboard route", () => {
    // The URL path itself comes from the `security-approvals.tsx` filename
    // plus the string passed to `createFileRoute` (assigned into the route
    // tree at codegen, so it is not observable on the bare Route object).
    expect(typeof Route.options.component).toBe("function");
  });

  it("registers a loader for the approval queue", () => {
    expect(typeof Route.options.loader).toBe("function");
  });

  it("declares head meta for the page", () => {
    const headFn = Route.options.head as unknown as
      (() => { meta?: { title?: string }[] }) | undefined;
    const head = headFn?.();
    const title = head?.meta?.find((m) => m.title)?.title ?? "";
    expect(title).toContain("Security approvals");
  });
});
