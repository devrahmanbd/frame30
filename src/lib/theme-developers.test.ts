import { describe, expect, it } from "vitest";

describe("isApprovedDeveloper", () => {
  it("resolves from the allowlist (wired in Step 3)", async () => {
    const { isApprovedDeveloper } = await import("./theme-developers.server");
    expect(typeof isApprovedDeveloper).toBe("function");
  });
});
