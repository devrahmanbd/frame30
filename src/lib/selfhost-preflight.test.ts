/**
 * The release gate for the self-hosted stack must itself be gated: if a compose
 * file stops parsing, a mount is renamed, an image tag floats or a templated
 * variable is missing from `ops/.env.example`, the build fails here rather than
 * at 3am on an operator's terminal.
 *
 * Only the static half runs (no --host): file-mounted secrets are git-ignored by
 * design and cannot exist in CI.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("self-hosted release preflight", () => {
  it("passes every static check", () => {
    const out = execFileSync("node", ["scripts/selfhost-preflight.mjs"], { encoding: "utf8" });
    expect(out).toContain("Static checks clean");
    expect(out).not.toMatch(/^FAIL/m);
  });
});
